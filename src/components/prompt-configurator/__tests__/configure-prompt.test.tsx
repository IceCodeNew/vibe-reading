// @vitest-environment jsdom
import type { CustomPromptsConfig } from "../context"
import type { TranslatePromptObj } from "@/types/config/translate"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { atom, createStore, Provider } from "jotai"
import { expect, it } from "vitest"
import { renderBuiltinPromptTemplate } from "@/utils/constants/prompt"
import { ConfigurePrompt } from "../configure-prompt"
import { PromptConfiguratorContext } from "../context"

const LEGAL: TranslatePromptObj = {
  id: "builtin:legal",
  name: "Legal",
  systemPrompt: "",
  prompt: renderBuiltinPromptTemplate({ promptLanguage: "zh", domainId: "builtin:legal", withSummary: false }),
  promptLanguage: "zh",
}

/** Renders the sheet of the legal prompt with an empty list of own prompts. */
function renderLegalPrompt() {
  const config = atom<CustomPromptsConfig>({ promptId: null, patterns: [] })
  const store = createStore()
  render(
    <Provider store={store}>
      <PromptConfiguratorContext value={{ promptAtoms: { config }, insertCells: [] }}>
        <ConfigurePrompt originPrompt={LEGAL} />
      </PromptConfiguratorContext>
    </Provider>,
  )
  return { savedPrompts: () => store.get(config).patterns }
}

const button = (name: string) => screen.getByRole("button", { name })
function promptText(): HTMLTextAreaElement {
  const field = screen.getAllByRole("textbox").find(box => box instanceof HTMLTextAreaElement && box.value === LEGAL.prompt)
  if (!(field instanceof HTMLTextAreaElement))
    throw new Error("The prompt text field is missing")
  return field
}

it("user customizes the legal prompt: Given its read-only view, When the user customizes it, chooses English and saves, Then a new prompt with the legal text and English is saved", async () => {
  const { savedPrompts } = renderLegalPrompt()
  fireEvent.click(button("options.quality.prompts.view"))
  expect(promptText()).toBeDisabled()

  fireEvent.click(button("options.quality.prompts.editor.customize"))
  expect(promptText()).toBeEnabled()
  fireEvent.click(button("options.quality.promptLanguage.en"))
  fireEvent.click(button("options.quality.prompts.editor.save"))

  await waitFor(() => expect(savedPrompts()).toHaveLength(1))
  const [copy] = savedPrompts()
  expect(copy.id).not.toBe(LEGAL.id)
  expect(copy.prompt).toBe(LEGAL.prompt)
  expect(copy.promptLanguage).toBe("en")
})

it("user opens the legal prompt again: Given the user customized it and closed the sheet, When the sheet opens again, Then the prompt is read-only again", async () => {
  renderLegalPrompt()
  fireEvent.click(button("options.quality.prompts.view"))
  fireEvent.click(button("options.quality.prompts.editor.customize"))
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" })
  await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())

  fireEvent.click(button("options.quality.prompts.view"))

  expect(promptText()).toBeDisabled()
  expect(screen.queryByRole("button", { name: "options.quality.prompts.editor.save" })).not.toBeInTheDocument()
})
