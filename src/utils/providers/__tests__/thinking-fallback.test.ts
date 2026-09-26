import type { JSONValue } from "ai"
import type { APIProviderConfig } from "@/types/config/provider"
import { describe, expect, it } from "vitest"
import { getThinkingFallbackOptions, isReasoningEffortError, runWithThinkingFallback } from "../thinking-fallback"
import { defaultProvider } from "./fake-chat-gateway"

const GATEWAY_ERROR = "Invalid option: expected one of \"low\"|\"medium\"|\"high\"|\"xhigh\"|\"max\""

/** A gateway in front of DeepSeek V4.1 Flash: it rejects reasoningEffort none and records the options it gets. */
function strictGateway() {
  const received: unknown[] = []
  const test = async (config: APIProviderConfig) => {
    received.push(config.providerOptions)
    if (config.providerOptions?.reasoningEffort === "none")
      throw new Error(GATEWAY_ERROR)
    return "Hola"
  }
  return { received, test }
}

function providerFor(provider: "openai-compatible" | "deepseek", providerOptions: Record<string, JSONValue>): APIProviderConfig {
  return { ...defaultProvider(provider), apiKey: "key", model: "any-model", providerOptions }
}

describe("thinking fallback for custom providers", () => {
  it.each([
    "Invalid option: expected one of \"low\"|\"medium\"|\"high\"|\"xhigh\"|\"max\"",
    "Unsupported value for reasoning_effort: none",
    "reasoningEffort is not supported by this model",
  ])("user's endpoint rejects the reasoning option: Given the error %s, When the test fails, Then it is a reasoning effort error", (message) => {
    expect(isReasoningEffortError(new Error(message))).toBe(true)
  })

  it("user's endpoint fails for another reason: Given an authentication error, When the test fails, Then it is not a reasoning effort error", () => {
    expect(isReasoningEffortError(new Error("Invalid API key"))).toBe(false)
  })

  it("user kept the preset: Given reasoningEffort none and another option, When the fallback is made, Then only reasoningEffort is replaced by the thinking switch", () => {
    expect(getThinkingFallbackOptions({ reasoningEffort: "none", topK: 20 })).toEqual({ topK: 20, thinking: { type: "disabled" } })
  })

  it.each([
    [{ reasoningEffort: "low" }],
    [{ topK: 20 }],
    [undefined],
  ])("user changed the preset: Given the options %j, When the fallback is made, Then there is no fallback", (options) => {
    expect(getThinkingFallbackOptions(options)).toBeUndefined()
  })

  it("user tests a custom provider behind a strict gateway: Given the preset and another option, When the gateway rejects none, Then the second request uses the thinking switch and the fallback reports why", async () => {
    const gateway = strictGateway()

    const outcome = await runWithThinkingFallback(providerFor("openai-compatible", { reasoningEffort: "none", topK: 20 }), gateway.test)

    expect(gateway.received).toEqual([{ reasoningEffort: "none", topK: 20 }, { topK: 20, thinking: { type: "disabled" } }])
    expect(outcome).toEqual({ result: "Hola", fallback: { options: { topK: 20, thinking: { type: "disabled" } }, reason: GATEWAY_ERROR } })
  })

  it("user tests a DeepSeek provider: Given the same error, When the test fails, Then the error stays and there is no second request", async () => {
    const gateway = strictGateway()

    await expect(runWithThinkingFallback(providerFor("deepseek", { reasoningEffort: "none" }), gateway.test)).rejects.toThrow(GATEWAY_ERROR)
    expect(gateway.received).toHaveLength(1)
  })
})
