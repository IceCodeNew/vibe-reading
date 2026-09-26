import type { Config } from "@/types/config/config"
import { afterAll, beforeAll, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { defaultProvider, startFakeChatGateway } from "@/utils/providers/__tests__/fake-chat-gateway"
import { aiTranslate } from "../ai"

let gateway: Awaited<ReturnType<typeof startFakeChatGateway>>

beforeAll(async () => {
  gateway = await startFakeChatGateway()
  fakeBrowser.reset()
})

afterAll(async () => {
  await gateway.close()
})

it("user tests settings before they are saved: Given the stored custom provider has an old base URL and model, When a translation runs with the edited settings, Then the request goes to the edited base URL with the edited model", async () => {
  const saved = defaultProvider("openai-compatible")
  const stored: Config = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config => config.id === saved.id ? { ...saved, apiKey: "key", baseURL: "http://127.0.0.1:9/v1", model: "old-model" } : config),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, stored)
  const edited = { ...saved, apiKey: "key", baseURL: gateway.baseURL, model: "new-model" }

  const translation = await aiTranslate("Hello", "spa", edited, async () => ({ systemPrompt: "", prompt: "Hello" }))

  expect(translation).toBe("Hola")
  expect(gateway.models).toEqual(["new-model"])
})
