import type { LLMProviderConfig } from "@/types/config/provider"
import { createServer } from "node:http"
import { isLLMProviderConfig } from "@/types/config/provider"
import { DEFAULT_CONFIG } from "@/utils/constants/config"

/** The error text of a gateway in front of DeepSeek V4.1 Flash for a reasoning_effort it does not accept. */
export const REASONING_EFFORT_ERROR = "Invalid option: expected one of \"low\"|\"medium\"|\"high\"|\"xhigh\"|\"max\""

export interface ChatGatewayBehavior {
  /** The reasoning_effort values that the gateway rejects with {@link REASONING_EFFORT_ERROR}. */
  rejectedEfforts?: string[]
  /** When true, the gateway answers every request with a server error. */
  down?: boolean
  /** When set, the gateway waits for it before it answers a request with the thinking switch. */
  holdThinking?: Promise<void>
  /** The text of each answer. The default is "Hola". */
  answer?: string
}

export interface ReceivedOptions {
  reasoning_effort?: string
  thinking?: unknown
}

/**
 * Starts a local gateway with the OpenAI Chat Completions wire contract
 * (https://platform.openai.com/docs/api-reference/chat/create), which custom
 * providers use. It answers each request and records the reasoning options
 * of each request. A test changes `behavior` to make the gateway strict, down or slow.
 */
export async function startFakeChatGateway() {
  const received: ReceivedOptions[] = []
  const gateway: { behavior: ChatGatewayBehavior, received: ReceivedOptions[], baseURL: string, close: () => Promise<void> } = {
    behavior: {},
    received,
    baseURL: "",
    close: async () => {},
  }
  const server = createServer(async (request, response) => {
    let body = ""
    for await (const chunk of request)
      body += chunk
    const { reasoning_effort, thinking }: ReceivedOptions = JSON.parse(body)
    received.push({ reasoning_effort, thinking })
    const { rejectedEfforts = [], down = false, holdThinking, answer = "Hola" } = gateway.behavior
    response.setHeader("Content-Type", "application/json")
    if (down) {
      response.writeHead(500).end(JSON.stringify({ error: { message: "The server had an error" } }))
      return
    }
    if (reasoning_effort !== undefined && rejectedEfforts.includes(reasoning_effort)) {
      response.writeHead(400).end(JSON.stringify({ error: { message: REASONING_EFFORT_ERROR } }))
      return
    }
    if (thinking)
      await holdThinking
    response.end(JSON.stringify({
      id: "chatcmpl-test",
      object: "chat.completion",
      created: 1,
      model: "deepseek-v4.1-flash",
      choices: [{ index: 0, message: { role: "assistant", content: answer }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    }))
  })
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve))
  const address = server.address()
  if (!address || typeof address === "string")
    throw new Error("The fake gateway has no port")
  gateway.baseURL = `http://127.0.0.1:${address.port}`
  gateway.close = () => new Promise<void>(resolve => server.close(() => resolve()))
  return gateway
}

/** The provider of this type in the default config. */
export function defaultProvider<P extends LLMProviderConfig["provider"]>(provider: P): Extract<LLMProviderConfig, { provider: P }> {
  const defaults = DEFAULT_CONFIG.providersConfig.find((config): config is Extract<LLMProviderConfig, { provider: P }> => isLLMProviderConfig(config) && config.provider === provider)
  if (!defaults)
    throw new Error(`The default config has no ${provider} provider`)
  return defaults
}
