// @vitest-environment jsdom
import type { CustomPromptsConfig } from "../context"
import type { TranslatePromptObj } from "@/types/config/translate"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { atom, createStore, Provider } from "jotai"
import { Toaster } from "sonner"
import { expect, it } from "vitest"
import { PromptConfiguratorContext } from "../context"
import { ImportPrompts } from "../import-prompts"

it("user imports a prompt file from an earlier version: Given a Chinese prompt without a prompt language and a system prompt, When the user picks the file, Then the prompt is added with a new id, an empty system prompt and Chinese, and the page says so", async () => {
  const existing: TranslatePromptObj = { id: "mine", name: "Mine", systemPrompt: "", prompt: "{{input}}", promptLanguage: "en" }
  const config = atom<CustomPromptsConfig>({ promptId: null, patterns: [existing] })
  const store = createStore()
  render(
    <Provider store={store}>
      <PromptConfiguratorContext value={{ promptAtoms: { config }, insertCells: [] }}>
        <ImportPrompts />
        <Toaster />
      </PromptConfiguratorContext>
    </Provider>,
  )
  const input = screen.getByLabelText("options.quality.prompts.import")
  const file = new File([JSON.stringify([{ name: "中文", prompt: "请翻译成{{targetLanguage}}：\n{{input}}" }])], "Plainly_prompts.json", { type: "text/json" })

  fireEvent.change(input, { target: { files: [file] } })

  expect(await screen.findByText("options.quality.prompts.importSuccess")).toBeInTheDocument()
  await waitFor(() => expect(store.get(config).patterns).toHaveLength(2))
  const [, imported] = store.get(config).patterns
  expect(imported).toEqual({ id: expect.any(String), name: "中文", systemPrompt: "", prompt: "请翻译成{{targetLanguage}}：\n{{input}}", promptLanguage: "zh" })
  expect(imported.id).not.toBe(existing.id)
})
