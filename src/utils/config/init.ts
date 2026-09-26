import type { Config } from "@/types/config/config"
import type { ConfigMeta } from "@/types/config/meta"
import { dequal } from "dequal"
import { storage } from "#imports"
import { configSchema } from "@/types/config/config"
import { isAPIProviderConfig, isCustomLLMProvider } from "@/types/config/provider"
import { CONFIG_SCHEMA_VERSION, CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "../constants/config"
import { CUSTOM_PROVIDER_PRESET_OPTIONS } from "../constants/providers"
import { logger } from "../logger"

/**
 * Version 1 sent the preset options for a custom provider without saved
 * provider options. Save them, so that the provider options field shows them
 * and the user can change or remove them.
 */
function saveCustomProviderPresetOptions(config: Config): { config: Config, changed: boolean } {
  let changed = false
  const providersConfig = config.providersConfig.map((providerConfig) => {
    if (!isCustomLLMProvider(providerConfig.provider) || providerConfig.providerOptions !== undefined)
      return providerConfig
    changed = true
    return { ...providerConfig, providerOptions: { ...CUSTOM_PROVIDER_PRESET_OPTIONS } }
  })
  return { config: changed ? { ...config, providersConfig } : config, changed }
}

interface Migration {
  version: number
  migrate: (config: Config) => { config: Config, changed: boolean }
}

/**
 * Config changes for configs that an older version saved. A migration runs
 * once, when the saved schema version is lower than its version.
 */
const MIGRATIONS = [
  { version: 2, migrate: saveCustomProviderPresetOptions },
] as const satisfies readonly Migration[]

type LastMigration = typeof MIGRATIONS extends readonly [...Migration[], infer Last extends Migration] ? Last : never
// The version that initializeConfig saves. It must be the version of the last
// migration, or that migration runs again at each start. Type checking fails
// when CONFIG_SCHEMA_VERSION is a different version.
const CURRENT_SCHEMA_VERSION: LastMigration["version"] = CONFIG_SCHEMA_VERSION

/**
 * Initialize the config, this function should only be called once in the background script
 * @returns The extension config
 */
export async function initializeConfig() {
  const [storedConfig, configMeta] = await Promise.all([
    storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`),
    storage.getMeta<ConfigMeta>(`local:${CONFIG_STORAGE_KEY}`),
  ])

  let config: Config
  let didConfigChange = false

  if (!storedConfig) {
    config = DEFAULT_CONFIG
    didConfigChange = true
  }
  else {
    config = storedConfig
  }

  const parseResult = configSchema.safeParse(config)
  if (!parseResult.success) {
    logger.warn("Config is invalid, using default config")
    config = DEFAULT_CONFIG
    didConfigChange = true
  }
  else if (!dequal(config, parseResult.data)) {
    config = parseResult.data
    didConfigChange = true
  }

  // Migrations change only a config that an older version saved.
  const savedSchemaVersion = storedConfig ? (configMeta?.schemaVersion ?? 1) : CURRENT_SCHEMA_VERSION
  for (const { version, migrate } of MIGRATIONS) {
    if (savedSchemaVersion < version) {
      const result = migrate(config)
      config = result.config
      didConfigChange = didConfigChange || result.changed
    }
  }

  if (import.meta.env.DEV) {
    const apiKeyResult = applyAPIKeysFromEnv(config)
    config = apiKeyResult.config
    didConfigChange = didConfigChange || apiKeyResult.changed
  }

  const didMetaNeedUpdate
    = configMeta?.schemaVersion !== CURRENT_SCHEMA_VERSION
      || configMeta?.lastModifiedAt === undefined

  if (didConfigChange) {
    await storage.setItem<Config>(`local:${CONFIG_STORAGE_KEY}`, config)
  }

  if (didConfigChange || didMetaNeedUpdate) {
    await storage.setMeta<ConfigMeta>(`local:${CONFIG_STORAGE_KEY}`, {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      lastModifiedAt: configMeta?.lastModifiedAt ?? Date.now(),
    })
  }
}

function applyAPIKeysFromEnv(config: Config): { config: Config, changed: boolean } {
  let changed = false

  const providersConfig = config.providersConfig.map((providerConfig) => {
    if (!isAPIProviderConfig(providerConfig)) {
      return providerConfig
    }

    const apiKeyEnvName = `WXT_${providerConfig.provider.toUpperCase()}_API_KEY`
    const envApiKey = import.meta.env[apiKeyEnvName] as string | undefined
    if (!envApiKey || providerConfig.apiKey === envApiKey) {
      return providerConfig
    }

    changed = true
    return {
      ...providerConfig,
      apiKey: envApiKey,
    }
  })

  if (!changed) {
    return { config, changed: false }
  }

  return {
    config: {
      ...config,
      providersConfig,
    },
    changed: true,
  }
}
