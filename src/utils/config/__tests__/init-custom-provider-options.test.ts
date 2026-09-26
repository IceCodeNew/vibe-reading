import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import { beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_SCHEMA_VERSION, CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { initializeConfig } from "../init"

beforeEach(() => {
  fakeBrowser.reset()
})

async function start(providerOptions: Record<ProviderConfig["provider"], Record<string, unknown> | undefined>) {
  const saved = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({ ...provider, providerOptions: providerOptions[provider.provider] })),
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)
  await initializeConfig()
  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  if (!stored)
    throw new Error("The extension saved no config")
  return Object.fromEntries(stored.providersConfig.map(provider => [provider.provider, provider.providerOptions]))
}

it("user upgrades with a custom provider without saved options: Given it sent reasoningEffort none by default, When the extension starts, Then its provider options show that value and the other providers stay the same", async () => {
  expect(await start({ "openai": undefined, "deepseek": undefined, "openai-compatible": undefined })).toEqual({
    "openai": undefined,
    "deepseek": undefined,
    "openai-compatible": { reasoningEffort: "none" },
  })
})

it.each([
  [{}],
  [{ reasoningEffort: "low" }],
])("user upgrades with saved options %j for a custom provider: Given the saved options, When the extension starts, Then they stay", async (options) => {
  expect((await start({ "openai": undefined, "deepseek": undefined, "openai-compatible": options }))["openai-compatible"]).toEqual(options)
})

it("user clears the options of a custom provider after the upgrade: Given no saved options in the current version, When the extension starts again, Then the options stay empty", async () => {
  await storage.setMeta(`local:${CONFIG_STORAGE_KEY}`, { schemaVersion: CONFIG_SCHEMA_VERSION, lastModifiedAt: 1 })

  expect((await start({ "openai": undefined, "deepseek": undefined, "openai-compatible": undefined }))["openai-compatible"]).toBeUndefined()
})
