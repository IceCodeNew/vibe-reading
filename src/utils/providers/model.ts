import type { LLMProviderConfig } from "@/types/config/provider"
import { createDeepSeek } from "@ai-sdk/deepseek"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { isCustomLLMProvider } from "@/types/config/provider"
import { getLLMProvidersConfig, getProviderConfigById } from "../config/helpers"
import { getLocalConfig } from "../config/storage"
import { normalizeBaseURL } from "./base-url"
import { getProviderHeadersWithOverride } from "./headers"
import { resolveModelId } from "./model-id"

const CREATE_AI_MAPPER = {
  "openai-compatible": createOpenAICompatible,
  "openai": createOpenAI,
  "deepseek": createDeepSeek,
} as const

/**
 * The language model for this provider config. Callers that have the config
 * pass it, so that a test of unsaved settings uses those settings.
 */
export function getModel(providerConfig: LLMProviderConfig) {
  const headers = getProviderHeadersWithOverride(providerConfig.provider, providerConfig.headers)
  const baseURL = normalizeBaseURL(providerConfig.baseURL)
  const provider = isCustomLLMProvider(providerConfig.provider)
    ? CREATE_AI_MAPPER[providerConfig.provider]({
        name: providerConfig.provider,
        baseURL: baseURL ?? "",
        supportsStructuredOutputs: true,
        ...(providerConfig.apiKey && { apiKey: providerConfig.apiKey }),
        ...(headers && { headers }),
      })
    : CREATE_AI_MAPPER[providerConfig.provider]({
        ...(baseURL && { baseURL }),
        ...(providerConfig.apiKey && { apiKey: providerConfig.apiKey }),
        ...(headers && { headers }),
      })

  const modelId = resolveModelId(providerConfig.model)

  if (!modelId) {
    throw new Error("Model is undefined")
  }

  return provider.languageModel(modelId)
}

export async function getModelById(providerId: string) {
  // Parse the stored config: storage can still hold fields from an older version.
  const config = await getLocalConfig()
  if (!config) {
    throw new Error("Config not found")
  }

  const providerConfig = getProviderConfigById(getLLMProvidersConfig(config.providersConfig), providerId)
  if (!providerConfig) {
    throw new Error(`Provider ${providerId} not found`)
  }

  return getModel(providerConfig)
}
