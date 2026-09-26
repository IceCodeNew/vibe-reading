import type { AddressInfo } from "node:net"
import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { Buffer } from "node:buffer"
import { createServer } from "node:http"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { setupLLMGenerateTextMessageHandlers } from "@/entrypoints/background/llm-generate-text"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { detectLanguageWithSource } from "@/utils/content/language"
import { generateArticleSummary } from "@/utils/content/summary"
import { aiTranslate } from "@/utils/host/translate/api/ai"

const requests: Record<string, unknown>[] = []

// A local server with the OpenAI Chat Completions wire contract, which the
// DeepSeek and OpenAI-compatible providers use:
// https://platform.openai.com/docs/api-reference/chat/create
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = []
  for await (const chunk of request)
    chunks.push(chunk as Buffer)
  const body = JSON.parse(Buffer.concat(chunks).toString()) as { model: string, messages: { content: string }[], reasoning_effort?: string }
  requests.push(body)
  // Some OpenAI-compatible gateways in front of DeepSeek V4.1 Flash reject other values.
  if (body.reasoning_effort !== undefined && !["low", "medium", "high", "xhigh", "max"].includes(body.reasoning_effort)) {
    response.writeHead(400, { "Content-Type": "application/json" })
    response.end(JSON.stringify({ error: { message: "Invalid option: expected one of \"low\"|\"medium\"|\"high\"|\"xhigh\"|\"max\"" } }))
    return
  }
  const isLanguageDetection = JSON.stringify(body.messages).includes("language detection")
  response.setHeader("Content-Type", "application/json")
  response.end(JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: body.model,
    choices: [{
      index: 0,
      message: { role: "assistant", content: isLanguageDetection ? JSON.stringify({ reason: "English", code: "eng" }) : "Result" },
      finish_reason: "stop",
    }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
})

let baseURL = ""

function providerFor(provider: "deepseek" | "openai-compatible"): LLMProviderConfig {
  const defaults = DEFAULT_CONFIG.providersConfig.find(config => config.provider === provider) as LLMProviderConfig
  return {
    ...defaults,
    apiKey: "test-key",
    baseURL,
    model: provider === "deepseek" ? "deepseek-flash" : "any-model",
    providerOptions: undefined,
  }
}

const DEFAULTS = [
  {
    provider: "deepseek",
    outcome: "thinking is off",
    check: (request: Record<string, unknown>) => expect(request).toMatchObject({ thinking: { type: "disabled" } }),
  },
  {
    provider: "openai-compatible",
    outcome: "no reasoning option is added",
    check: (request: Record<string, unknown>) => {
      expect(request).not.toHaveProperty("reasoning_effort")
      expect(request).not.toHaveProperty("thinking")
    },
  },
] as const

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  fakeBrowser.reset()
  setupLLMGenerateTextMessageHandlers()
})

beforeEach(async () => {
  requests.length = 0
  const config: Config = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config =>
      config.provider === "deepseek" || config.provider === "openai-compatible" ? providerFor(config.provider) : config),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, config)
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

describe.each(DEFAULTS)("reasoning options for the $provider provider", ({ provider, outcome, check }) => {
  it(`user translates a paragraph: Given no saved provider options, When the request is sent, Then ${outcome}`, async () => {
    await aiTranslate("Hello", "cmn", providerFor(provider), async () => ({ systemPrompt: "", prompt: "Translate: Hello" }))

    expect(requests).toHaveLength(1)
    check(requests[0])
  })

  it(`user reads a page with page context: Given no saved provider options, When the summary is made, Then ${outcome}`, async () => {
    await generateArticleSummary("Release notes", "The release adds a setting.", providerFor(provider))

    expect(requests).toHaveLength(1)
    check(requests[0])
  })

  it(`user opens a page in an unknown language: Given no saved provider options, When the language is detected, Then ${outcome}`, async () => {
    const result = await detectLanguageWithSource("This paragraph is long enough for language detection.", { providerConfig: providerFor(provider) })

    expect(result).toEqual({ code: "eng", source: "llm" })
    check(requests[0])
  })

  it("user turned thinking on in the provider options: Given saved options, When a paragraph is translated, Then only the saved options are sent", async () => {
    const saved = provider === "deepseek" ? { thinking: { type: "enabled" } } : { reasoningEffort: "low" }
    await aiTranslate("Hello", "cmn", { ...providerFor(provider), providerOptions: saved }, async () => ({ systemPrompt: "", prompt: "Translate: Hello" }))

    expect(requests[0]).toMatchObject(provider === "deepseek" ? { thinking: { type: "enabled" } } : { reasoning_effort: "low" })
  })
})
