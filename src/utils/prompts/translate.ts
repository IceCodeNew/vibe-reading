import type { LangCodeISO6393 } from "@/definitions"
import type { Config } from "@/types/config/config"
import type { PromptLanguage, TranslatePromptObj } from "@/types/config/translate"
import type { WebPagePromptContext } from "@/types/content"
import { getLocalConfig } from "@/utils/config/storage"
import { DEFAULT_CONFIG } from "../constants/config"
import {
  BATCH_RULE,
  BATCH_RULE_TEXT,
  BATCH_TRANSLATE_RULES,
  getOptionalSectionPattern,
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
    const customPromptLanguage = customPrompt.promptLanguage ?? promptLanguage
    return renderCustomPrompt(customPrompt, customPromptLanguage, getTargetLanguageName(targetCode, customPromptLanguage), input, options)
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
      batchRule: options?.isBatch ? BATCH_RULE_TEXT[promptLanguage] : undefined,
    }),
  }
}

const BATCH_RULE_CELL = getTokenCellText(BATCH_RULE)
const PAGE_TOKENS = [WEB_TITLE, WEB_DESCRIPTION, WEB_CONTENT, WEB_SUMMARY] as const
type PageToken = typeof PAGE_TOKENS[number]
// The text for a page token outside an optional section, when the page has no value.
const MISSING_PAGE_VALUE: Record<PageToken, string> = {
  webTitle: "No title available",
  webDescription: "No description available",
  webContent: "No content available",
  webSummary: "No summary available",
}
const VALUE_TOKEN_CELL = new RegExp(`\\{\\{(${[TARGET_LANGUAGE, INPUT, ...PAGE_TOKENS].join("|")})\\}\\}`, "g")
const OPTIONAL_SECTIONS = PAGE_TOKENS.map(token => ({ token, pattern: getOptionalSectionPattern(token) }))
// Marks the place of a removed section until its line is checked.
const REMOVED_SECTION = "\u0000"

/**
 * Keeps the text of each optional section {{#token}}...{{/token}} when the
 * page has a value for the token, and removes the section otherwise. A line
 * that holds only removed sections and spaces goes away, and so does one blank
 * line next to it when blank lines are on its two sides.
 */
function renderOptionalSections(text: string, pageValues: Record<PageToken, string>): string {
  const marked = OPTIONAL_SECTIONS.reduce(
    (result, { token, pattern }) => result.replace(pattern, (_section, content: string) => pageValues[token] ? content : REMOVED_SECTION),
    text,
  )
  if (!marked.includes(REMOVED_SECTION))
    return marked
  const lines = marked.split("\n")
  const kept: string[] = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    if (!line.includes(REMOVED_SECTION) || line.replaceAll(REMOVED_SECTION, "").trim() !== "") {
      kept.push(line)
      continue
    }
    // A removed line between two blank lines takes one of them with it.
    if (kept.at(-1)?.trim() === "" && lines[index + 1]?.trim() === "")
      index++
  }
  return kept.join("\n").replaceAll(REMOVED_SECTION, "")
}

/**
 * A custom prompt with {{batchRule}} gets the batch rule there in a batch
 * request, and loses that line otherwise. A custom prompt without it gets
 * the English batch rules in the system prompt.
 *
 * The tokens are replaced in one pass, so token text in a value, such as a
 * paragraph about templates, reaches the model unchanged.
 */
function renderCustomPrompt(
  customPrompt: TranslatePromptObj,
  promptLanguage: PromptLanguage,
  targetLanguage: string,
  input: string,
  options?: TranslatePromptOptions<WebPagePromptContext>,
): TranslatePromptResult {
  const hasBatchRule = customPrompt.systemPrompt.includes(BATCH_RULE_CELL) || customPrompt.prompt.includes(BATCH_RULE_CELL)
  const systemPrompt = options?.isBatch && !hasBatchRule
    ? `${customPrompt.systemPrompt}

${BATCH_TRANSLATE_RULES}`
    : customPrompt.systemPrompt
  const replaceBatchRule = (text: string) => options?.isBatch
    ? text.replaceAll(BATCH_RULE_CELL, BATCH_RULE_TEXT[promptLanguage])
    : text.replaceAll(`\n${BATCH_RULE_CELL}`, "").replaceAll(BATCH_RULE_CELL, "")

  const pageValue = (token: PageToken) => options?.context?.[token]?.trim() ?? ""
  const pageValues: Record<PageToken, string> = {
    webTitle: pageValue(WEB_TITLE),
    webDescription: pageValue(WEB_DESCRIPTION),
    webContent: pageValue(WEB_CONTENT),
    webSummary: pageValue(WEB_SUMMARY),
  }
  const values: Record<string, string> = {
    [TARGET_LANGUAGE]: targetLanguage,
    [INPUT]: input,
    ...Object.fromEntries(PAGE_TOKENS.map(token => [token, pageValues[token] || MISSING_PAGE_VALUE[token]])),
  }
  const replaceTokens = (text: string) => renderOptionalSections(replaceBatchRule(text), pageValues)
    .replace(VALUE_TOKEN_CELL, (_cell, token: string) => values[token])

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
