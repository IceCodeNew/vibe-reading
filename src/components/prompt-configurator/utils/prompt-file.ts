import type { TranslatePromptObj } from "@/types/config/translate"
import { z } from "zod"
import { translatePromptObjSchema } from "@/types/config/translate"
import { APP_NAME } from "@/utils/constants/app"
import { inferPromptLanguage } from "@/utils/prompts/prompt-language"

export type PromptConfig = Omit<TranslatePromptObj, "id">
export type PromptConfigList = PromptConfig[]

const PROMPTS_FILE = `${APP_NAME}_prompts`
const OBJECT_URL_LIFETIME_MS = 40_000

// The prompts of an exported file. Files from earlier versions can have no
// system prompt and no prompt language.
const promptFileSchema = z.array(translatePromptObjSchema.omit({ id: true }).extend({
  name: z.string().min(1),
  prompt: z.string().min(1),
  systemPrompt: z.string().optional(),
}))

/**
 * The prompts of a file, ready to add. A prompt without a prompt language
 * gets the language of its text, like a saved prompt after the upgrade.
 */
function readPromptFile(text: string): PromptConfigList {
  const result = promptFileSchema.safeParse(JSON.parse(text))
  if (!result.success)
    throw new Error("Prompt config is invalid")
  return result.data.map(({ systemPrompt = "", ...prompt }) => ({
    ...prompt,
    systemPrompt,
    promptLanguage: prompt.promptLanguage ?? inferPromptLanguage(`${systemPrompt}\n${prompt.prompt}`),
  }))
}

export function downloadJSONFile(data: object) {
  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: "text/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.download = `${PROMPTS_FILE}.json`
  anchor.href = url
  anchor.rel = "noopener"
  document.body.append(anchor)
  anchor.click()
  anchor.remove()

  // Firefox and Chromium can still use the URL after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_LIFETIME_MS)
}

export function analysisJSONFile(file: File): Promise<PromptConfigList> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsText(file)
    reader.onload = (e) => {
      try {
        const fileResult = e.target?.result ?? "[]"
        if (typeof fileResult === "string") {
          resolve(readPromptFile(fileResult))
        }
        else {
          reject(new Error("Prompt config is invalid"))
        }
      }
      catch (e) {
        reject(e)
      }
    }
    reader.onerror = error => reject(error)
  })
}
