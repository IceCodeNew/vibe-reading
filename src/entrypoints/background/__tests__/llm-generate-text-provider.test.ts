import { beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { storage } from "#imports"
import { CONFIG_STORAGE_KEY, DEFAULT_CONFIG } from "@/utils/constants/config"
import { runGenerateTextInBackground } from "../llm-generate-text"

beforeEach(() => {
  fakeBrowser.reset()
})

it("user opens a page before the extension saved its config: Given no config in storage, When the background generates text, Then it fails because the config is missing", async () => {
  await expect(runGenerateTextInBackground({ providerId: "openai-default", prompt: "Hi" })).rejects.toThrow("Config not found")
})

it("user deleted the provider that a request names: Given a config without that provider, When the background generates text, Then it fails because the provider is missing", async () => {
  await storage.setItem(`local:${CONFIG_STORAGE_KEY}`, DEFAULT_CONFIG)

  await expect(runGenerateTextInBackground({ providerId: "deleted", prompt: "Hi" })).rejects.toThrow("Provider deleted not found")
})
