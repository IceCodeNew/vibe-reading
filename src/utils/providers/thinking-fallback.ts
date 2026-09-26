import type { JSONValue } from "ai"
import type { Config } from "@/types/config/config"
import { dequal } from "dequal"
import { configSchema } from "@/types/config/config"
import { isCustomLLMProvider } from "@/types/config/provider"
import { storageAdapter } from "@/utils/atoms/storage-adapter"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { CUSTOM_PROVIDER_PRESET_OPTIONS } from "@/utils/constants/providers"
import { DEEPSEEK_THINKING_OFF_OPTIONS } from "./options"

// Gateways in front of DeepSeek V4.1 Flash reject `reasoning_effort: "none"`
// with a message such as `Invalid option: expected one of "low"|"medium"|"high"|"xhigh"|"max"`,
// which does not name the parameter.
const REASONING_EFFORT_ERROR = /reasoning[_\s-]?effort|expected one of "low"\|"medium"\|"high"/i

export function isReasoningEffortError(error: unknown): error is Error {
  return error instanceof Error && REASONING_EFFORT_ERROR.test(error.message)
}

/**
 * The provider options with the preset `reasoningEffort` replaced by the
 * DeepSeek switch that turns off thinking. Other options stay. Returns
 * undefined when the user changed or removed the preset value.
 */
export function getThinkingFallbackOptions(options: Record<string, JSONValue> | undefined): Record<string, JSONValue> | undefined {
  if (options?.reasoningEffort !== CUSTOM_PROVIDER_PRESET_OPTIONS.reasoningEffort)
    return undefined
  const { reasoningEffort: _reasoningEffort, ...others } = options
  return { ...others, ...DEEPSEEK_THINKING_OFF_OPTIONS }
}

export interface ThinkingFallback {
  /** The provider options that worked in place of the preset. */
  options: Record<string, JSONValue>
  /** The error message for the preset. */
  reason: string
}

interface FallbackProviderConfig {
  provider: string
  providerOptions?: Record<string, JSONValue>
}

/**
 * Runs `run` with the provider. When a custom provider rejects the preset
 * `reasoningEffort`, runs it again with the fallback options. Returns the
 * result, and the fallback when it was used.
 */
export async function runWithThinkingFallback<C extends FallbackProviderConfig, T>(
  providerConfig: C,
  run: (providerConfig: C) => Promise<T>,
): Promise<{ result: T, fallback?: ThinkingFallback }> {
  try {
    return { result: await run(providerConfig) }
  }
  catch (error) {
    if (!isCustomLLMProvider(providerConfig.provider) || !isReasoningEffortError(error))
      throw error
    const options = getThinkingFallbackOptions(providerConfig.providerOptions)
    if (!options)
      throw error
    const result = await run({ ...providerConfig, providerOptions: options })
    return { result, fallback: { options, reason: error.message } }
  }
}

let saving = Promise.resolve(false)

/**
 * Saves the fallback options for the provider when its saved provider
 * options are still `failedOptions`. Returns true when it saved them. Saves
 * run one at a time, so that parallel requests save and report only once.
 */
export function saveThinkingFallback(providerId: string, failedOptions: Record<string, JSONValue> | undefined, fallback: ThinkingFallback): Promise<boolean> {
  saving = saving.catch(() => false).then(async () => {
    const config = await storageAdapter.get<Config>(CONFIG_STORAGE_KEY, DEFAULT_CONFIG, configSchema)
    const saved = config.providersConfig.find(provider => provider.id === providerId)
    if (!saved || !dequal(saved.providerOptions, failedOptions))
      return false
    const providersConfig = config.providersConfig.map(provider => provider.id === providerId ? { ...provider, providerOptions: fallback.options } : provider)
    await storageAdapter.set<Config>(CONFIG_STORAGE_KEY, { ...config, providersConfig }, configSchema)
    await storageAdapter.setMeta(CONFIG_STORAGE_KEY, { lastModifiedAt: Date.now() })
    return true
  })
  return saving
}
