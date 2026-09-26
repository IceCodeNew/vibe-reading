import type { Config } from "@/types/config/config"
import { beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_SCHEMA_VERSION, CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { initializeConfig } from "../init"

beforeEach(() => {
  fakeBrowser.reset()
})

it("user upgrades from a version without prompt languages: Given a saved config with no prompt language, When the extension starts, Then the prompt language is auto and the other settings stay", async () => {
  // Given
  const { promptLanguage: _promptLanguage, ...translate } = DEFAULT_CONFIG.translate
  const saved = {
    ...DEFAULT_CONFIG,
    providersConfig: DEFAULT_CONFIG.providersConfig.map(provider => ({ ...provider, apiKey: `key-${provider.id}` })),
    translate: { ...translate, enableAIContentAware: true },
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)

  // When
  await initializeConfig()

  // Then
  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(stored?.translate.promptLanguage).toBe("auto")
  expect(stored?.translate.enableAIContentAware).toBe(true)
  expect(stored?.providersConfig.map(provider => provider.apiKey)).toEqual(saved.providersConfig.map(provider => provider.apiKey))
})

it("user selected a domain prompt: Given the legal prompt is saved as the selected prompt, When the extension starts, Then the selection stays", async () => {
  // Given
  const saved: Config = {
    ...DEFAULT_CONFIG,
    translate: { ...DEFAULT_CONFIG.translate, customPromptsConfig: { promptId: "builtin:legal", patterns: [] } },
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)

  // When
  await initializeConfig()

  // Then
  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(stored?.translate.customPromptsConfig.promptId).toBe("builtin:legal")
})

it("user has an unknown prompt selected: Given a saved prompt id that is neither built in nor in the list, When the extension starts, Then the config is reset to the defaults", async () => {
  // Given
  const saved: Config = {
    ...DEFAULT_CONFIG,
    translate: { ...DEFAULT_CONFIG.translate, customPromptsConfig: { promptId: "builtin:unknown", patterns: [] } },
  }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)

  // When
  await initializeConfig()

  // Then
  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  expect(stored?.translate.customPromptsConfig.promptId).toBeNull()
})

const OWN_PROMPTS: Config["translate"]["customPromptsConfig"]["patterns"] = [
  { id: "zh", name: "中文", systemPrompt: "", prompt: "请把下面的文本翻译成{{targetLanguage}}：\n{{input}}" },
  { id: "en", name: "English", systemPrompt: "You are a translator.", prompt: "Translate into {{targetLanguage}}:\n{{input}}" },
  { id: "ja", name: "日本語", systemPrompt: "", prompt: "次の文章を{{targetLanguage}}に翻訳してください。\n{{input}}" },
  { id: "pinned", name: "Pinned", systemPrompt: "", prompt: "Translate into {{targetLanguage}}:\n{{input}}", promptLanguage: "zh" },
]

async function startWithPrompts(meta?: { schemaVersion: number, lastModifiedAt: number }) {
  const saved: Config = { ...DEFAULT_CONFIG, translate: { ...DEFAULT_CONFIG.translate, customPromptsConfig: { promptId: null, patterns: OWN_PROMPTS } } }
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, saved)
  if (meta)
    await storage.setMeta(`local:${CONFIG_STORAGE_KEY}`, meta)
  await initializeConfig()
  const stored = await storage.getItem<Config>(`local:${CONFIG_STORAGE_KEY}`)
  return stored?.translate.customPromptsConfig.patterns.map(({ id, promptLanguage }) => ({ id, promptLanguage }))
}

it("user upgrades with own prompts: Given prompts without a prompt language, When the extension starts, Then a prompt with Chinese text gets Chinese, the others, also a Japanese prompt with kanji, get English, and a set language stays", async () => {
  expect(await startWithPrompts()).toEqual([
    { id: "zh", promptLanguage: "zh" },
    { id: "en", promptLanguage: "en" },
    { id: "ja", promptLanguage: "en" },
    { id: "pinned", promptLanguage: "zh" },
  ])
})

it("user lets a prompt follow the setting after the upgrade: Given no prompt language in the current version, When the extension starts again, Then the prompt keeps following the setting", async () => {
  expect(await startWithPrompts({ schemaVersion: CONFIG_SCHEMA_VERSION, lastModifiedAt: 1 })).toEqual([
    { id: "zh", promptLanguage: undefined },
    { id: "en", promptLanguage: undefined },
    { id: "ja", promptLanguage: undefined },
    { id: "pinned", promptLanguage: "zh" },
  ])
})
