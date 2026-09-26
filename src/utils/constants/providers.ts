import type { AllProviderTypes, APIProviderTypes, LLMProviderConfig, LLMProviderTypes, ProviderConfig, ProvidersConfig } from "@/types/config/provider"
import { API_PROVIDER_TYPES, TRANSLATE_PROVIDER_TYPES } from "@/types/config/provider"
import { pick } from "@/types/utils"

/**
 * The provider options of a new custom provider. They show in the provider
 * options field, where the user can change or remove them.
 */
export const CUSTOM_PROVIDER_PRESET_OPTIONS = { reasoningEffort: "none" } as const

export const DEFAULT_LLM_PROVIDER_MODELS = {
  "openai-compatible": "",
  "openai": "gpt-6-luna",
  "deepseek": "deepseek-flash",
} as const satisfies Record<LLMProviderTypes, LLMProviderConfig["model"]>

export interface ProviderItem {
  name: string
  /** One or two characters drawn in the provider mark; no remote logo is fetched. */
  monogram: string
  website: string
}

export const PROVIDER_ITEMS: Record<AllProviderTypes, ProviderItem> = {
  "openai-compatible": {
    name: "Custom Provider",
    monogram: "AI",
    website: "",
  },
  "openai": {
    name: "OpenAI",
    monogram: "O",
    website: "https://platform.openai.com",
  },
  "deepseek": {
    name: "DeepSeek",
    monogram: "D",
    website: "https://platform.deepseek.com",
  },
}

export const DEFAULT_PROVIDER_CONFIG = {
  "openai-compatible": {
    id: "openai-compatible-default",
    name: PROVIDER_ITEMS["openai-compatible"].name,
    enabled: true,
    provider: "openai-compatible",
    baseURL: "https://api.example.com/v1",
    model: DEFAULT_LLM_PROVIDER_MODELS["openai-compatible"],
    providerOptions: { ...CUSTOM_PROVIDER_PRESET_OPTIONS },
  },
  "openai": {
    id: "openai-default",
    name: PROVIDER_ITEMS.openai.name,
    enabled: true,
    provider: "openai",
    model: DEFAULT_LLM_PROVIDER_MODELS.openai,
  },
  "deepseek": {
    id: "deepseek-default",
    name: PROVIDER_ITEMS.deepseek.name,
    enabled: true,
    provider: "deepseek",
    model: DEFAULT_LLM_PROVIDER_MODELS.deepseek,
  },
} as const satisfies Record<AllProviderTypes, ProviderConfig>

export const DEFAULT_PROVIDER_CONFIG_LIST: ProvidersConfig = [
  DEFAULT_PROVIDER_CONFIG.openai,
  DEFAULT_PROVIDER_CONFIG.deepseek,
  DEFAULT_PROVIDER_CONFIG["openai-compatible"],
]

export const TRANSLATE_PROVIDER_ITEMS = pick(
  PROVIDER_ITEMS,
  TRANSLATE_PROVIDER_TYPES,
)

export const API_PROVIDER_ITEMS = pick(
  PROVIDER_ITEMS,
  API_PROVIDER_TYPES,
)

/** Order providers are offered in the "add a service" menu. */
export const ADDABLE_PROVIDER_TYPES: readonly APIProviderTypes[] = ["openai", "deepseek", "openai-compatible"]
