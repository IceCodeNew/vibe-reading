import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import type { WebPagePromptContext } from "@/types/content"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { getTranslatePrompt } from "@/utils/prompts/translate"
import { defaultProvider, startFakeChatGateway } from "@/utils/providers/__tests__/fake-chat-gateway"
import { saveThinkingFallback } from "@/utils/providers/thinking-fallback"
import { executeBatchTranslation } from "../translation-queues"

let gateway: Awaited<ReturnType<typeof startFakeChatGateway>>
let provider: LLMProviderConfig
const { sendMessage } = fakeBrowser.tabs
const { set } = fakeBrowser.storage.local

async function storedOptions() {
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  return config?.providersConfig.find(item => item.id === provider.id)?.providerOptions
}

beforeAll(async () => {
  gateway = await startFakeChatGateway()
  provider = { ...defaultProvider("openai-compatible"), apiKey: "key", baseURL: gateway.baseURL, model: "deepseek-v4.1-flash", providerOptions: { reasoningEffort: "none", topK: 20 } }
})

beforeEach(async () => {
  fakeBrowser.reset()
  gateway.received.length = 0
  // A gateway in front of DeepSeek V4.1 Flash rejects reasoning_effort "none".
  gateway.behavior = { rejectedEfforts: ["none"] }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === provider.id ? provider : config),
    translate: { ...DEFAULT_CONFIG.translate, providerId: provider.id },
  })
})

afterEach(() => {
  fakeBrowser.tabs.sendMessage = sendMessage
  fakeBrowser.storage.local.set = set
})

afterAll(async () => {
  await gateway.close()
})

it("user translates a page without a connection test: Given a new custom provider with the preset behind a strict gateway, When a batch is translated, Then it is translated with the thinking switch and the saved options use it", async () => {
  const data = { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: "h", scheduleAt: 0 }

  const result = await executeBatchTranslation<WebPagePromptContext>([data], getTranslatePrompt)

  expect(result).toEqual(["Hola"])
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, { thinking: { type: "disabled" } }])
  expect(await storedOptions()).toEqual({ topK: 20, thinking: { type: "disabled" } })
})

it("user translates a page in a tab: Given the preset behind a strict gateway, When the fallback is saved, Then the tab gets the reason", async () => {
  const data = { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: "h", scheduleAt: 0, tabId: 7 }
  // A fake of tabs.sendMessage(tabId, message) that records what each tab gets.
  const sent: { tabId: number, message: { type: string, data: unknown } }[] = []
  fakeBrowser.tabs.sendMessage = async (tabId: number, message: { type: string, data: unknown }) => {
    sent.push({ tabId, message })
  }

  await executeBatchTranslation<WebPagePromptContext>([data], getTranslatePrompt)

  expect(sent.map(({ tabId, message }) => ({ tabId, type: message.type, data: message.data }))).toEqual([
    { tabId: 7, type: "notifyThinkingFallback", data: { reason: expect.stringContaining("Invalid option") } },
  ])
})

it("user set another reasoning effort: Given saved reasoningEffort low that the gateway also rejects, When a batch is translated, Then the error shows and no other request is sent", async () => {
  gateway.behavior = { rejectedEfforts: ["none", "low"] }
  const data = { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: { ...provider, providerOptions: { reasoningEffort: "low" } }, hash: "h", scheduleAt: 0 }

  await expect(executeBatchTranslation<WebPagePromptContext>([data], getTranslatePrompt)).rejects.toThrow("Invalid option")

  expect(gateway.received).toEqual([{ reasoning_effort: "low" }])
})

it("user translates a page when the options cannot be saved: Given storage that rejects writes, When the fallback works, Then the page still gets the translation from that request", async () => {
  const data = { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, hash: "h", scheduleAt: 0 }
  // The browser rejects a write with this message when the storage quota is full.
  fakeBrowser.storage.local.set = () => Promise.reject(new Error("QUOTA_BYTES quota exceeded"))

  const result = await executeBatchTranslation<WebPagePromptContext>([data], getTranslatePrompt)

  expect(result).toEqual(["Hola"])
  expect(gateway.received).toEqual([{ reasoning_effort: "none" }, { thinking: { type: "disabled" } }])
})

it("user changed the options while the page was translated: Given other saved options, When the fallback works, Then the saved options stay", async () => {
  await saveThinkingFallback(provider.id, provider.providerOptions, { options: { reasoningEffort: "low" }, reason: "" })

  const saved = await saveThinkingFallback(provider.id, provider.providerOptions, { options: { thinking: { type: "disabled" } }, reason: "" })

  expect(saved).toBe(false)
  expect(await storedOptions()).toEqual({ reasoningEffort: "low" })
})

it("user translates several paragraphs at once: Given parallel requests that all used the fallback, When they save, Then only one save reports it", async () => {
  const fallback = { options: { topK: 20, thinking: { type: "disabled" } }, reason: "" }

  const saved = await Promise.all([1, 2, 3].map(() => saveThinkingFallback(provider.id, provider.providerOptions, fallback)))

  expect(saved.filter(Boolean)).toHaveLength(1)
})
