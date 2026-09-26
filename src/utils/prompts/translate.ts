import type { LangCodeISO6393 } from "@/definitions"
import type { Config } from "@/types/config/config"
import type { TranslatePromptObj } from "@/types/config/translate"
import type { WebPagePromptContext } from "@/types/content"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "../constants/config"
import {
  BATCH_TRANSLATE_RULES,
  getTokenCellText,
  INPUT,
  isDomainPromptId,
  renderBuiltinTranslatePrompt,
  TARGET_LANGUAGE,
  WEB_CONTENT,
  WEB_DESCRIPTION,
  WEB_SUMMARY,
  WEB_TITLE,
} from "../constants/prompt"
import { getTargetLanguageName, resolvePromptLanguage } from "./prompt-language"

export interface TranslatePromptOptions<TContext = unknown> {
  isBatch?: boolean
  context?: TContext
}

export interface TranslatePromptResult {
  systemPrompt: string
  prompt: string
}

export function resolvePromptReplacementValue(value: string | null | undefined, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value : fallback
}

export function getTranslatePromptFromConfig(
  translateConfig: Pick<Config["translate"], "customPromptsConfig" | "promptLanguage">,
  targetCode: LangCodeISO6393,
  input: string,
  options?: TranslatePromptOptions<WebPagePromptContext>,
): TranslatePromptResult {
  const { patterns, promptId } = translateConfig.customPromptsConfig
  const promptLanguage = resolvePromptLanguage(translateConfig.promptLanguage, targetCode)
  const customPrompt = patterns.find(pattern => pattern.id === promptId)
  if (customPrompt) {
    return renderCustomPrompt(customPrompt, getTargetLanguageName(targetCode, promptLanguage), input, options)
  }

  return {
    systemPrompt: "",
    prompt: renderBuiltinTranslatePrompt({
      promptLanguage,
      targetLanguage: getTargetLanguageName(targetCode, promptLanguage),
      input,
      domainId: isDomainPromptId(promptId) ? promptId : undefined,
      webTitle: options?.context?.webTitle,
      webSummary: options?.context?.webSummary,
      isBatch: options?.isBatch,
    }),
  }
}

/** Custom prompts get the English batch rules in the system prompt. */
function renderCustomPrompt(
  customPrompt: TranslatePromptObj,
  targetLanguage: string,
  input: string,
  options?: TranslatePromptOptions<WebPagePromptContext>,
): TranslatePromptResult {
  const systemPrompt = options?.isBatch
    ? `${customPrompt.systemPrompt}

${BATCH_TRANSLATE_RULES}`
    : customPrompt.systemPrompt

  // Build title and summary replacement values
  const title = resolvePromptReplacementValue(options?.context?.webTitle, "No title available")
  const description = resolvePromptReplacementValue(options?.context?.webDescription, "No description available")
  const contentText = resolvePromptReplacementValue(options?.context?.webContent, "No content available")
  const summary = resolvePromptReplacementValue(options?.context?.webSummary, "No summary available")

  // Replace tokens in both prompts
  const replaceTokens = (text: string) =>
    text
      .replaceAll(getTokenCellText(TARGET_LANGUAGE), targetLanguage)
      .replaceAll(getTokenCellText(INPUT), input)
      .replaceAll(getTokenCellText(WEB_TITLE), title)
      .replaceAll(getTokenCellText(WEB_DESCRIPTION), description)
      .replaceAll(getTokenCellText(WEB_CONTENT), contentText)
      .replaceAll(getTokenCellText(WEB_SUMMARY), summary)

  return {
    systemPrompt: replaceTokens(systemPrompt),
    prompt: replaceTokens(customPrompt.prompt),
  }
}

export async function getTranslatePrompt(
  targetCode: LangCodeISO6393,
  input: string,
  options?: TranslatePromptOptions<WebPagePromptContext>,
): Promise<TranslatePromptResult> {
  const config = await getLocalConfig() ?? DEFAULT_CONFIG
  return getTranslatePromptFromConfig(config.translate, targetCode, input, options)
}
