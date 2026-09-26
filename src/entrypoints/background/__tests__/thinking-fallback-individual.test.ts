import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { BATCH_SEPARATOR } from "@/utils/constants/prompt"
import { defaultProvider, startFakeChatGateway } from "@/utils/providers/__tests__/fake-chat-gateway"
import { setUpWebPageTranslationQueue } from "../translation-queues"

// The gateway answers one paragraph with two, so a batch never gets one
// result for each paragraph.
const TWO_PARAGRAPHS = `Hola\n\n${BATCH_SEPARATOR}\n\nHola`
let gateway: Awaited<ReturnType<typeof startFakeChatGateway>>
let provider: LLMProviderConfig

beforeAll(async () => {
  gateway = await startFakeChatGateway()
  gateway.behavior = { rejectedEfforts: ["none"], answer: TWO_PARAGRAPHS }
  provider = { ...defaultProvider("openai-compatible"), apiKey: "key", baseURL: gateway.baseURL, model: "deepseek-v4.1-flash", providerOptions: { reasoningEffort: "none" } }
})

beforeEach(async () => {
  fakeBrowser.reset()
  gateway.received.length = 0
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === provider.id ? provider : config),
    translate: { ...DEFAULT_CONFIG.translate, providerId: provider.id },
  })
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] })
})

afterEach(() => {
  vi.useRealTimers()
})

afterAll(async () => {
  await gateway.close()
})

/** Moves the fake clock in small steps and lets the local server answer between them. */
async function settle<T>(promise: Promise<T>): Promise<T> {
  const state = { done: false }
  const tracked = promise.finally(() => {
    state.done = true
  })
  while (!state.done) {
    await vi.advanceTimersByTimeAsync(100)
    await new Promise(resolve => setImmediate(resolve))
  }
  return tracked
}

it("user translates a paragraph that the gateway answers as two: Given the preset behind a strict gateway, When the batch falls back to one request for the paragraph, Then that request also uses the thinking switch", async () => {
  await setUpWebPageTranslationQueue()
  const tab = await fakeBrowser.tabs.create({ url: "https://example.com" })
  // The listener answers through sendResponse, like a Chrome message listener that returns true.
  const response = new Promise((resolve) => {
    void fakeBrowser.runtime.onMessage.trigger(
      { id: 1, type: "enqueueTranslateRequest", timestamp: Date.now(), data: { text: "Hello", langConfig: DEFAULT_CONFIG.language, providerConfig: provider, scheduleAt: Date.now(), hash: "" } },
      { tab },
      resolve,
    )
  })

  expect(await settle(response)).toEqual({ res: TWO_PARAGRAPHS })
  // Each request first sends the preset and then the thinking switch: the
  // first batch request and its three retries, then the request for the paragraph.
  expect(gateway.received).toEqual(Array.from({ length: 5 }, () => [{ reasoning_effort: "none" }, { thinking: { type: "disabled" } }]).flat())
  const config = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(config?.providersConfig.find(item => item.id === provider.id)?.providerOptions).toEqual({ thinking: { type: "disabled" } })
})
