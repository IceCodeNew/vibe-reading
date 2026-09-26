import type { AddressInfo } from "node:net"
import type { Config } from "@/types/config/config"
import type { LLMProviderConfig } from "@/types/config/provider"
import { Buffer } from "node:buffer"
import { createServer } from "node:http"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { getTranslatePrompt } from "@/utils/prompts/translate"

const requests: { messages: { role: string, content: string }[] }[] = []

// A local server with the OpenAI Chat Completions wire contract, which the
// DeepSeek and OpenAI-compatible providers use:
// https://platform.openai.com/docs/api-reference/chat/create
const server = createServer(async (request, response) => {
  const chunks: Buffer[] = []
  for await (const chunk of request)
    chunks.push(chunk as Buffer)
  const body = JSON.parse(Buffer.concat(chunks).toString())
  requests.push(body)
  response.setHeader("Content-Type", "application/json")
  response.end(JSON.stringify({
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model: body.model,
    choices: [{ index: 0, message: { role: "assistant", content: "你好" }, finish_reason: "stop" }],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }))
})

let baseURL = ""

function providerFor(provider: "deepseek" | "openai-compatible"): LLMProviderConfig {
  const defaults = DEFAULT_CONFIG.providersConfig.find(config => config.provider === provider) as LLMProviderConfig
  return { ...defaults, apiKey: "test-key", baseURL, model: "test-model" }
}

async function saveConfig(customPromptsConfig: Config["translate"]["customPromptsConfig"]) {
  const config: Config = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(config =>
      config.provider === "deepseek" || config.provider === "openai-compatible" ? providerFor(config.provider) : config),
    translate: { ...DEFAULT_CONFIG.translate, customPromptsConfig },
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, config)
}

beforeAll(async () => {
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  baseURL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

beforeEach(() => {
  fakeBrowser.reset()
  requests.length = 0
})

afterAll(async () => {
  await new Promise(resolve => server.close(resolve))
})

describe.each(["deepseek", "openai-compatible"] as const)("translation request to the %s provider", (provider) => {
  it("user translates with the default prompt: Given no custom prompt, When a paragraph is translated into Chinese, Then the request has only the user message with the Hy-MT2 instruction", async () => {
    await saveConfig({ promptId: null, patterns: [] })

    await executeTranslate("Hello", DEFAULT_CONFIG.language, providerFor(provider), getTranslatePrompt, { isBatch: true })

    expect(requests).toHaveLength(1)
    expect(requests[0].messages).toEqual([{
      role: "user",
      content: "将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释。\n你必须在译文中保留等量的分隔符，绝对不可遗漏、转义或翻译该符号，并注意分隔符的位置。\n\nHello",
    }])
  })

  it("user translates with their own prompt: Given a custom prompt with a system prompt, When a paragraph is translated, Then the system prompt is sent before the user message", async () => {
    await saveConfig({
      promptId: "mine",
      patterns: [{ id: "mine", name: "Mine", systemPrompt: "Translate into {{targetLanguage}}.", prompt: "{{input}}" }],
    })

    await executeTranslate("Hello", DEFAULT_CONFIG.language, providerFor(provider), getTranslatePrompt)

    expect(requests[0].messages).toEqual([
      { role: "system", content: "Translate into 简体中文." },
      { role: "user", content: "Hello" },
    ])
  })
})
