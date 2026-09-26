import type { LangCodeISO6393 } from "@/definitions"
import type { Config } from "@/types/config/config"
import type { PromptLanguageSetting, TranslatePromptObj } from "@/types/config/translate"
import type { WebPagePromptContext } from "@/types/content"
import { describe, expect, it } from "vitest"
import { BATCH_SEPARATOR, BATCH_TRANSLATE_RULES } from "@/utils/constants/prompt"
import { getTranslatePromptFromConfig } from "../translate"

const CUSTOM_PROMPT: TranslatePromptObj = {
  id: "custom-1",
  name: "Mine",
  systemPrompt: "You translate into {{targetLanguage}}.",
  prompt: "Title: {{webTitle}}\n{{input}}",
}

function translatePrompt({
  promptId = null,
  promptLanguage = "auto",
  targetCode,
  input = "Hello world",
  isBatch = false,
  context,
}: {
  promptId?: string | null
  promptLanguage?: PromptLanguageSetting
  targetCode: LangCodeISO6393
  input?: string
  isBatch?: boolean
  context?: WebPagePromptContext
}) {
  const translateConfig: Pick<Config["translate"], "customPromptsConfig" | "promptLanguage"> = {
    customPromptsConfig: { promptId, patterns: [CUSTOM_PROMPT] },
    promptLanguage,
  }
  return getTranslatePromptFromConfig(translateConfig, targetCode, input, { isBatch, context })
}

describe("built-in translation prompt", () => {
  it("user translates into Chinese with the default settings: Given the prompt language is auto, When the target is Simplified Chinese, Then the model gets the Hy-MT2 Chinese default template and no system prompt", () => {
    const result = translatePrompt({ targetCode: "cmn" })

    expect(result).toEqual({
      systemPrompt: "",
      prompt: "将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释：\n\nHello world",
    })
  })

  it("user translates into a non-Chinese language with the default settings: Given the prompt language is auto, When the target is Spanish, Then the model gets the Hy-MT2 English default template", () => {
    const result = translatePrompt({ targetCode: "spa", input: "你好" })

    expect(result.prompt).toBe("Translate the following text into Spanish. Note that you should only output the translated result without any additional explanation:\n\n你好")
  })

  it("user pins Chinese prompts: Given the prompt language is Chinese, When the target is Spanish, Then the prompt names the target language in Chinese", () => {
    const result = translatePrompt({ promptLanguage: "zh", targetCode: "spa" })

    expect(result.prompt).toBe("将以下文本翻译为西班牙语，注意只需要输出翻译后的结果，不要额外解释：\n\nHello world")
  })

  it("user pins English prompts: Given the prompt language is English, When the target is Simplified Chinese, Then the prompt is in English", () => {
    const result = translatePrompt({ promptLanguage: "en", targetCode: "cmn" })

    expect(result.prompt).toBe("Translate the following text into Simplified Mandarin Chinese. Note that you should only output the translated result without any additional explanation:\n\nHello world")
  })

  it("user translates into Traditional Chinese or Cantonese: Given the prompt language is auto, When the target is one of them, Then the Chinese prompt uses its own Chinese name", () => {
    expect(translatePrompt({ targetCode: "cmn-Hant" }).prompt).toContain("将以下文本翻译为繁体中文，")
    expect(translatePrompt({ targetCode: "yue" }).prompt).toContain("将以下文本翻译为粤语，")
  })

  it("user pins Chinese prompts for a rare language: Given no Chinese name is known for Fiji Hindi, When it is the target, Then the prompt keeps its English name", () => {
    const result = translatePrompt({ promptLanguage: "zh", targetCode: "hif" })

    expect(result.prompt).toContain("将以下文本翻译为Fiji Hindi，")
  })

  it("user translates a page with a title and a summary: Given the page context, When the target is Simplified Chinese, Then the model gets the Hy-MT2 background template", () => {
    const result = translatePrompt({
      targetCode: "cmn",
      context: { webTitle: " Release notes ", webSummary: "The release adds a setting.", webContent: "Body" },
    })

    expect(result.prompt).toBe("【背景信息】\n标题: Release notes\n摘要: The release adds a setting.\n\n请结合背景信息将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释。\n\n【待翻译文本】\nHello world")
  })

  it("user translates a page with only a title: Given no summary, When the target is Spanish, Then the background has only the title line", () => {
    const result = translatePrompt({ targetCode: "spa", context: { webTitle: "Release notes", webSummary: "  " } })

    expect(result.prompt).toBe("[Background Information]\nTitle: Release notes\n\nPlease translate the following text into Spanish, taking the provided background information into consideration. Note that you should only output the translated result without any additional explanation.\n\n[Source Text]\nHello world")
  })

  it("user translates a Chinese page into English with page context: Given a title and a summary, When the prompt is in English, Then the background lists both", () => {
    const result = translatePrompt({ targetCode: "eng", input: "你好", context: { webTitle: "发布说明", webSummary: "新增一个设置。" } })

    expect(result.prompt).toBe("[Background Information]\nTitle: 发布说明\nSummary: 新增一个设置。\n\nPlease translate the following text into English, taking the provided background information into consideration. Note that you should only output the translated result without any additional explanation.\n\n[Source Text]\n你好")
  })

  it("user translates several paragraphs at once: Given a batch request, When the target is Simplified Chinese, Then the Hy-MT2 delimiter rule comes after the instruction", () => {
    const input = `First${BATCH_SEPARATOR}\n\n${BATCH_SEPARATOR}\n\nSecond`
    const result = translatePrompt({ targetCode: "cmn", input, isBatch: true })

    expect(result.systemPrompt).toBe("")
    expect(result.prompt).toBe(`将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释。\n你必须在译文中保留等量的分隔符，绝对不可遗漏、转义或翻译该符号，并注意分隔符的位置。\n\n${input}`)
  })

  it("user translates several paragraphs of a page into English: Given a batch request with a title, When the prompt is in English, Then the English delimiter rule comes before the source text", () => {
    const result = translatePrompt({ targetCode: "eng", input: "你好", isBatch: true, context: { webTitle: "发布说明" } })

    expect(result.prompt).toBe("[Background Information]\nTitle: 发布说明\n\nPlease translate the following text into English, taking the provided background information into consideration. Note that you should only output the translated result without any additional explanation.\nYou must retain the exact same number of delimiters in the translation. Strictly do not omit, escape, or translate these symbols, and pay close attention to their placement.\n\n[Source Text]\n你好")
  })
})

describe("domain translation prompt", () => {
  it.each([
    ["builtin:legal", "正式的法律文书语体", "formal legal language"],
    ["builtin:medical", "专业的医学语体", "professional medical language"],
    ["builtin:finance", "专业的金融语体", "professional financial language"],
    ["builtin:technology", "技术文档语体", "technical documentation language"],
  ])("user selects the %s prompt: Given no page context, When they translate, Then the model gets the Hy-MT2 style template with the domain style", (promptId, zhStyle, enStyle) => {
    const zh = translatePrompt({ promptId, targetCode: "cmn" })
    const en = translatePrompt({ promptId, targetCode: "spa" })

    expect(zh.systemPrompt).toBe("")
    expect(zh.prompt).toMatch(new RegExp(`^将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释。\\n注意翻译的风格要严格符合【${zhStyle}[^】]*】\\n\\nHello world$`))
    expect(en.prompt).toMatch(new RegExp(`^Translate the following text into Spanish\\. Note that you should only output the translated result without any additional explanation\\.\\nNote that the translation style must strictly conform to \\[${enStyle}[^\\]]*\\]\\.\\n\\nHello world$`))
  })

  it("user selects the legal prompt on a page with a title: Given the page context, When they translate, Then the background template also carries the legal style", () => {
    const result = translatePrompt({ promptId: "builtin:legal", targetCode: "cmn", context: { webTitle: "Contract" } })

    expect(result.prompt).toBe("【背景信息】\n标题: Contract\n\n请结合背景信息将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释。\n注意翻译的风格要严格符合【正式的法律文书语体，法律术语准确，条款编号和定义术语与原文一致】\n\n【待翻译文本】\nHello world")
  })

  it("user selects the technology prompt: Given text with placeholders, When they translate, Then the placeholders in the text reach the model unchanged", () => {
    const input = `Hello {{webTitle}}, you have %s messages and \${count} alerts.`
    const result = translatePrompt({ promptId: "builtin:technology", targetCode: "cmn", input, context: { webTitle: "Inbox" } })

    expect(result.prompt.endsWith(`【待翻译文本】\n${input}`)).toBe(true)
  })
})

describe("custom translation prompt", () => {
  it.each([
    ["zh", "spa", "西班牙语"],
    ["en", "cmn", "Simplified Mandarin Chinese"],
    ["auto", "cmn", "简体中文"],
    ["auto", "spa", "Spanish"],
  ] as const)("user uses their own prompt: Given the prompt language %s, When they translate into %s, Then {{targetLanguage}} is %s like in the built-in prompts", (promptLanguage, targetCode, name) => {
    const result = translatePrompt({ promptId: CUSTOM_PROMPT.id, promptLanguage, targetCode, context: { webTitle: "Docs" } })

    expect(result).toEqual({
      systemPrompt: `You translate into ${name}.`,
      prompt: "Title: Docs\nHello world",
    })
  })

  it("user uses their own prompt for several paragraphs: Given a batch request, When the target is Chinese, Then the English batch rules follow their system prompt", () => {
    const result = translatePrompt({ promptId: CUSTOM_PROMPT.id, targetCode: "cmn", isBatch: true })

    expect(result.systemPrompt).toBe(`You translate into 简体中文.\n\n${BATCH_TRANSLATE_RULES}`)
  })

  it("user deleted the selected prompt: Given the prompt id is not in the list, When they translate, Then the default prompt is used", () => {
    const result = translatePrompt({ promptId: "deleted", targetCode: "cmn" })

    expect(result.prompt).toBe("将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释：\n\nHello world")
  })
})
