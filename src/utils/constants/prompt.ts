import type { PromptLanguage } from "@/types/config/translate"

export const WEB_PAGE_PROMPT_TOKENS = ["targetLanguage", "input", "webTitle", "webDescription", "webContent", "webSummary", "batchRule"] as const

/**
 * Separator used to distinguish multiple text segments in batch translation.
 * It is used to differentiate different text paragraphs when merging multiple translation tasks into a single request.
 */
export const BATCH_SEPARATOR = "%%"
export const BATCH_SEPARATOR_LINE_PATTERN = /\r?\n[ \t]*%%[ \t]*\r?\n/

export const TARGET_LANGUAGE = WEB_PAGE_PROMPT_TOKENS[0]
export const INPUT = WEB_PAGE_PROMPT_TOKENS[1]
export const WEB_TITLE = WEB_PAGE_PROMPT_TOKENS[2]
export const WEB_DESCRIPTION = WEB_PAGE_PROMPT_TOKENS[3]
export const WEB_CONTENT = WEB_PAGE_PROMPT_TOKENS[4]
export const WEB_SUMMARY = WEB_PAGE_PROMPT_TOKENS[5]
export const BATCH_RULE = WEB_PAGE_PROMPT_TOKENS[6]

export const getTokenCellText = (token: string) => `{{${token}}}`

/**
 * An optional section of a custom prompt. Its text goes away when the page
 * has no value for the token.
 */
export const getOptionalSectionText = (token: string, text: string) => `{{#${token}}}${text}{{/${token}}}`

/** Finds each optional section of the token. The first group is its text. */
export const getOptionalSectionPattern = (token: string) => new RegExp(`\\{\\{#${token}\\}\\}([\\s\\S]*?)\\{\\{/${token}\\}\\}`, "g")

type OptionalSection = (token: string, text: string) => string
const keepText: OptionalSection = (_token, text) => text

/** Rules for custom prompts in requests that join several paragraphs with {@link BATCH_SEPARATOR} lines. */
export const BATCH_TRANSLATE_RULES = `## Multi-paragraph Translation Rules
1. If input contains a standalone line containing only ${BATCH_SEPARATOR}, use a standalone ${BATCH_SEPARATOR} line in your output. If input has no standalone ${BATCH_SEPARATOR} line, don't use ${BATCH_SEPARATOR} in your output.
2. **CRITICAL**: Treat ${BATCH_SEPARATOR} as a separator only when it appears on its own line. Do not treat ${BATCH_SEPARATOR} as a separator when it appears inside normal text, code, quotes, or punctuation.

## OUTPUT FORMAT:
- **Single paragraph input** → Output translation directly (no separators, no extra text)
- **Multi-paragraph input (input uses standalone ${BATCH_SEPARATOR} separator lines)** → Put ${BATCH_SEPARATOR} on its own line between translations

## Examples

### Multi-paragraph Input:
Paragraph A

${BATCH_SEPARATOR}

Paragraph B

${BATCH_SEPARATOR}

Paragraph C

### Multi-paragraph Output:
Translation A

${BATCH_SEPARATOR}

Translation B

${BATCH_SEPARATOR}

Translation C

### Single paragraph Input:
Single paragraph content

### Single paragraph Output:
Direct translation without separators
`

export const DOMAIN_PROMPT_IDS = ["builtin:legal", "builtin:medical", "builtin:finance", "builtin:technology"] as const
export type DomainPromptId = typeof DOMAIN_PROMPT_IDS[number]

export function isDomainPromptId(id: string | null): id is DomainPromptId {
  return DOMAIN_PROMPT_IDS.includes(id as DomainPromptId)
}

const DOMAIN_STYLES: Record<DomainPromptId, Record<PromptLanguage, string>> = {
  "builtin:legal": {
    en: "formal legal language, with accurate legal terms, and clause numbers and defined terms kept as in the source",
    zh: "正式的法律文书语体，法律术语准确，条款编号和定义术语与原文一致",
  },
  "builtin:medical": {
    en: "professional medical language, with standard medical terms, and drug names, doses and units kept exactly as in the source",
    zh: "专业的医学语体，使用规范的医学术语，药品名称、剂量和单位与原文完全一致",
  },
  "builtin:finance": {
    en: "professional financial language, with standard financial and accounting terms, and numbers, currencies and ticker symbols kept exactly as in the source",
    zh: "专业的金融语体，使用规范的金融和会计术语，数字、币种和股票代码与原文完全一致",
  },
  "builtin:technology": {
    en: `technical documentation language, with consistent technical terms, and code, commands, identifiers and placeholders such as {{var}}, \${var} and %s kept untranslated`,
    zh: `技术文档语体，技术术语前后一致，代码、命令、标识符以及 {{var}}、\${var}、%s 等占位符保持原样不译`,
  },
}

export interface BuiltinTranslatePromptInput {
  promptLanguage: PromptLanguage
  targetLanguage: string
  input: string
  domainId?: DomainPromptId
  webTitle?: string | null
  webSummary?: string | null
  /** The line after the instruction: the batch rule in a batch request. */
  batchRule?: string
}

/**
 * The Hy-MT2 "Delimiters" rule. A batch request needs it, because it joins
 * several paragraphs with {@link BATCH_SEPARATOR} lines.
 */
export const BATCH_RULE_TEXT: Record<PromptLanguage, string> = {
  zh: "你必须在译文中保留等量的分隔符，绝对不可遗漏、转义或翻译该符号，并注意分隔符的位置。",
  en: "You must retain the exact same number of delimiters in the translation. Strictly do not omit, escape, or translate these symbols, and pay close attention to their placement.",
}

/** The labels of the Hy-MT2 "Background" template. */
const BACKGROUND_LABELS: Record<PromptLanguage, { background: string, title: string, summary: string, source: string }> = {
  zh: { background: "【背景信息】", title: "标题", summary: "摘要", source: "【待翻译文本】" },
  en: { background: "[Background Information]", title: "Title", summary: "Summary", source: "[Source Text]" },
}

/**
 * Renders a built-in prompt from the Hy-MT2 translation instruction templates
 * (https://huggingface.co/tencent/Hy-MT2-7B): "Background" when the page has
 * a title or summary, "Style" for a domain prompt, and "Default" otherwise.
 * A batch adds the Hy-MT2 "Delimiters" rule. Hy-MT2 has no system prompt, so
 * everything goes in the user message.
 *
 * Every instruction asks for the translation only: without it, models copied
 * the background labels into the translation in batch tests.
 *
 * `optional` wraps the background, the summary line and the source text
 * label, which depend on the page. By default they stay as they are.
 */
export function renderBuiltinTranslatePrompt(
  { promptLanguage, targetLanguage, input, domainId, webTitle, webSummary, batchRule }: BuiltinTranslatePromptInput,
  optional: OptionalSection = keepText,
): string {
  const zh = promptLanguage === "zh"
  const labels = BACKGROUND_LABELS[promptLanguage]
  const style = domainId && DOMAIN_STYLES[domainId][promptLanguage]
  const titleLine = webTitle?.trim() ? `${labels.title}: ${webTitle.trim()}` : ""
  const summaryLine = webSummary?.trim() ? optional(WEB_SUMMARY, `${titleLine && "\n"}${labels.summary}: ${webSummary.trim()}`) : ""
  const background = titleLine + summaryLine
  // The official "Default" template ends with a colon before the text. In a
  // batch request the batch rule comes next, so the instruction ends with a period.
  const end = !background && !style && !batchRule ? (zh ? "：" : ":") : (zh ? "。" : ".")

  const instruction = zh
    ? [
        `${background ? "请结合背景信息将以下文本翻译为" : "将以下文本翻译为"}${targetLanguage}，注意只需要输出翻译后的结果，不要额外解释${end}`,
        style && `注意翻译的风格要严格符合【${style}】`,
        batchRule,
      ]
    : [
        `${background ? `Please translate the following text into ${targetLanguage}, taking the provided background information into consideration.` : `Translate the following text into ${targetLanguage}.`} Note that you should only output the translated result without any additional explanation${end}`,
        style && `Note that the translation style must strictly conform to [${style}].`,
        batchRule,
      ]

  const instructionText = instruction.filter(Boolean).join("\n")
  if (!background)
    return `${instructionText}\n\n${input}`
  return `${optional(WEB_TITLE, `${labels.background}\n${background}\n\n`)}${instructionText}\n\n${optional(WEB_TITLE, `${labels.source}\n`)}${input}`
}

/**
 * The built-in prompt with token cells in place of the values, as shown in
 * the prompt list. The summary line is there only when page context can
 * supply a summary. It is also the start content when the reader makes a
 * custom prompt from a built-in one.
 *
 * The background and the source text label are optional sections of
 * {{webTitle}}, and the summary line is an optional section of
 * {{webSummary}}. Thus a page without a summary gives the same request as
 * the built-in prompt. A page without a title loses the background, but the
 * instruction keeps the background wording, because its text is fixed.
 */
export function renderBuiltinPromptTemplate({ promptLanguage, domainId, withSummary }: { promptLanguage: PromptLanguage, domainId?: DomainPromptId, withSummary: boolean }): string {
  return renderBuiltinTranslatePrompt({
    promptLanguage,
    targetLanguage: getTokenCellText(TARGET_LANGUAGE),
    input: getTokenCellText(INPUT),
    domainId,
    webTitle: getTokenCellText(WEB_TITLE),
    webSummary: withSummary ? getTokenCellText(WEB_SUMMARY) : null,
    batchRule: getTokenCellText(BATCH_RULE),
  }, getOptionalSectionText)
}

/**
 * UI sentinel value for default prompt selection
 * NOTE: This is NOT stored in config - it's only used in UI components
 * Config stores `null` for default, this string is just for Select/UI compatibility
 */
export const DEFAULT_TRANSLATE_PROMPT_ID = "__default__"

export function isBuiltinPromptId(id: string): boolean {
  return id === DEFAULT_TRANSLATE_PROMPT_ID || isDomainPromptId(id)
}

export const DEFAULT_TRANSLATE_PROMPTS_CONFIG = {
  promptId: null,
  patterns: [],
}
