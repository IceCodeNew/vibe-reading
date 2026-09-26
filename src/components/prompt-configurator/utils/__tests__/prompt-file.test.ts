// @vitest-environment jsdom
import { expect, it } from "vitest"
import { analysisJSONFile } from "../prompt-file"

function promptFile(prompts: unknown) {
  return new File([JSON.stringify(prompts)], "Plainly_prompts.json", { type: "text/json" })
}

it("user imports prompts exported by this version: Given prompts with a prompt language, When the file is read, Then every prompt stays as it is", async () => {
  const prompts = [
    { name: "Mine", systemPrompt: "", prompt: "{{input}}", promptLanguage: "zh" },
    { name: "Old", systemPrompt: "", prompt: "{{input}}", promptLanguage: "en" },
  ]

  await expect(analysisJSONFile(promptFile(prompts))).resolves.toEqual(prompts)
})

it("user imports prompts exported by an earlier version: Given prompts without a prompt language or a system prompt, When the file is read, Then each prompt gets the language of its text, like saved prompts after the upgrade, and an empty system prompt", async () => {
  const prompts = [
    { name: "中文", prompt: "请把下面的文本翻译成{{targetLanguage}}：\n{{input}}" },
    { name: "English", systemPrompt: "Be brief.", prompt: "Translate into {{targetLanguage}}:\n{{input}}" },
  ]

  await expect(analysisJSONFile(promptFile(prompts))).resolves.toEqual([
    { name: "中文", systemPrompt: "", prompt: prompts[0].prompt, promptLanguage: "zh" },
    { name: "English", systemPrompt: "Be brief.", prompt: prompts[1].prompt, promptLanguage: "en" },
  ])
})

it("user imports a file with a wrong field: Given a system prompt that is not text, When the file is read, Then the import fails", async () => {
  const prompts = [{ name: "Mine", systemPrompt: 5, prompt: "{{input}}" }]

  await expect(analysisJSONFile(promptFile(prompts))).rejects.toThrow("Prompt config is invalid")
})

it("user imports a prompt with an unknown prompt language: Given \"auto\", which only the setting accepts, When the file is read, Then the import fails", async () => {
  const prompts = [{ name: "Mine", systemPrompt: "", prompt: "{{input}}", promptLanguage: "auto" }]

  await expect(analysisJSONFile(promptFile(prompts))).rejects.toThrow("Prompt config is invalid")
})
