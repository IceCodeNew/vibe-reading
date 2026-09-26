import type { LangCodeISO6393 } from "@/definitions"
import type { Config } from "@/types/config/config"
import type { PromptLanguageSetting, TranslatePromptObj } from "@/types/config/translate"
import type { WebPagePromptContext } from "@/types/content"
import { describe, expect, it } from "vitest"
import { BATCH_RULE_TEXT, BATCH_SEPARATOR, BATCH_TRANSLATE_RULES, DOMAIN_PROMPT_IDS, renderBuiltinPromptTemplate } from "@/utils/constants/prompt"
import { getTranslatePromptFromConfig } from "../translate"

const CUSTOM_PROMPT: TranslatePromptObj = {
  id: "custom-1",
  name: "Mine",
  systemPrompt: "You translate into {{targetLanguage}}.",
  prompt: "Title: {{webTitle}}\n{{input}}",
}

function translatePrompt({
  patterns = [CUSTOM_PROMPT],
  promptId = null,
  promptLanguage = "auto",
  targetCode,
  input = "Hello world",
  isBatch = false,
  context,
}: {
  patterns?: TranslatePromptObj[]
  promptId?: string | null
  promptLanguage?: PromptLanguageSetting
  targetCode: LangCodeISO6393
  input?: string
  isBatch?: boolean
  context?: WebPagePromptContext
}) {
  const translateConfig: Pick<Config["translate"], "customPromptsConfig" | "promptLanguage"> = {
    customPromptsConfig: { promptId, patterns },
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

  describe.each([
    { promptLanguage: "zh", targetCode: "fra", domainId: "builtin:legal", withSummary: false },
    { promptLanguage: "zh", targetCode: "cmn", domainId: undefined, withSummary: true },
    { promptLanguage: "en", targetCode: "fra", domainId: "builtin:technology", withSummary: true },
    { promptLanguage: "en", targetCode: "spa", domainId: undefined, withSummary: false },
  ] as const)("a copy of the $domainId prompt in $promptLanguage", ({ promptLanguage, targetCode, domainId, withSummary }) => {
    const copy: TranslatePromptObj = { id: "copy", name: "Copy", systemPrompt: "", prompt: renderBuiltinPromptTemplate({ promptLanguage, domainId, withSummary }) }
    const context = { webTitle: "Contract", webSummary: withSummary ? "A supply contract." : undefined }

    it.each([false, true])("user customizes a built-in prompt: Given a copy of its template, When a page is translated (batch: %s), Then the model gets the same request as with the built-in prompt", (isBatch) => {
      const input = isBatch ? `First\n\n${BATCH_SEPARATOR}\n\nSecond` : "First"
      const builtin = translatePrompt({ promptId: domainId ?? null, promptLanguage, targetCode, input, isBatch, context })

      const custom = translatePrompt({ patterns: [copy], promptId: copy.id, promptLanguage, targetCode, input, isBatch, context })

      expect(custom).toEqual(builtin)
    })
  })

  it.each([false, true])("user customizes a prompt while page context is on: Given the summary of the page failed, When a page is translated (batch: %s), Then the copy leaves out the summary line like the built-in prompt", (isBatch) => {
    const copy: TranslatePromptObj = { id: "copy", name: "Copy", systemPrompt: "", prompt: renderBuiltinPromptTemplate({ promptLanguage: "zh", domainId: "builtin:legal", withSummary: true }) }
    const context = { webTitle: "Contract" }
    const builtin = translatePrompt({ promptId: "builtin:legal", targetCode: "cmn", isBatch, context })

    const custom = translatePrompt({ patterns: [copy], promptId: copy.id, targetCode: "cmn", isBatch, context })

    expect(custom).toEqual(builtin)
  })

  it("user wrote a prompt before optional sections: Given {{webTitle}} outside a section and a page without a title, When a paragraph is translated, Then the prompt gets the text for a missing title like before", () => {
    const own: TranslatePromptObj = { id: "own", name: "Own", systemPrompt: "Title: {{webTitle}}\nTarget: {{targetLanguage}}", prompt: "{{webTitle}} {{input}}" }

    const result = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input: "Hello", context: { webTitle: " ", webSummary: "Summary" } })

    expect(result).toEqual({ systemPrompt: "Title: No title available\nTarget: Spanish", prompt: "No title available Hello" })
  })

  it("user marks a part of the prompt as optional: Given {{#webSummary}}...{{/webSummary}}, When a page without and with a summary is translated, Then the part and its line go away without a summary and stay without the marks with one", () => {
    const own: TranslatePromptObj = { id: "own", name: "Own", systemPrompt: "", prompt: "Translate into {{targetLanguage}}{{#webSummary}}, using the summary {{webSummary}}{{/webSummary}}.\n{{#webSummary}}Summary: {{webSummary}}{{/webSummary}}\n{{input}}" }

    const without = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input: "Hello", context: { webTitle: "Docs" } })
    const withSummary = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input: "Hello", context: { webTitle: "Docs", webSummary: "A guide." } })

    expect(without.prompt).toBe("Translate into Spanish.\nHello")
    expect(withSummary.prompt).toBe("Translate into Spanish, using the summary A guide..\nSummary: A guide.\nHello")
  })

  describe.each(["en", "zh"] as const)("every copy of a %s template", (promptLanguage) => {
    const labels = promptLanguage === "zh" ? ["【背景信息】", "【待翻译文本】"] : ["[Background Information]", "[Source Text]"]
    const targetCode = promptLanguage === "zh" ? "cmn" : "spa"

    it.each([undefined, ...DOMAIN_PROMPT_IDS].flatMap(domainId => [false, true].map(withSummary => ({ domainId, withSummary }))))("user customizes the $domainId prompt (summary line: $withSummary): Given a page with and without a title, When a paragraph is translated, Then the copy equals the built-in prompt with a title, and loses the background and the source text label without one", ({ domainId, withSummary }) => {
      const copy: TranslatePromptObj = { id: "copy", name: "Copy", systemPrompt: "", prompt: renderBuiltinPromptTemplate({ promptLanguage, domainId, withSummary }) }
      const context = { webTitle: "Contract", webSummary: withSummary ? "A supply contract." : undefined }
      const custom = (pageContext: WebPagePromptContext) => translatePrompt({ patterns: [copy], promptId: copy.id, promptLanguage, targetCode, input: "First", context: pageContext })

      expect(custom(context)).toEqual(translatePrompt({ promptId: domainId ?? null, promptLanguage, targetCode, input: "First", context }))
      const withoutTitle = custom({ webSummary: "A supply contract." }).prompt
      expect(withoutTitle).not.toContain(labels[0])
      expect(withoutTitle).not.toContain(labels[1])
      expect(withoutTitle.endsWith("\n\nFirst")).toBe(true)
    })
  })

  it("user copied a Chinese template: Given a copy with the Chinese prompt language and the Auto setting, When the target language becomes Spanish, Then the copy still gets the Chinese language name and the Chinese batch rule", () => {
    const copy: TranslatePromptObj = { id: "copy", name: "Copy", systemPrompt: "", promptLanguage: "zh", prompt: "将以下文本翻译为{{targetLanguage}}。\n{{batchRule}}\n\n{{input}}" }

    const result = translatePrompt({ patterns: [copy], promptId: copy.id, targetCode: "spa", input: "A", isBatch: true })

    expect(result.prompt).toBe(`将以下文本翻译为西班牙语。\n${BATCH_RULE_TEXT.zh}\n\nA`)
  })

  it("user translates text about template tokens: Given a paragraph with {{webTitle}} and {{webContent}} in it, When it is translated with a custom prompt, Then the paragraph reaches the model unchanged", () => {
    const own: TranslatePromptObj = { id: "own", name: "Own", systemPrompt: "", prompt: "Page: {{webTitle}}\n{{input}}" }
    const input = "Use {{webTitle}} or {{webContent}} in your template."

    const result = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input, context: { webTitle: "Docs", webContent: "Body" } })

    expect(result.prompt).toBe(`Page: Docs\n${input}`)
  })

  it("user puts an optional section on its own line between blank lines: Given a page without a summary, When a paragraph is translated, Then the section goes away with one of the blank lines", () => {
    const own: TranslatePromptObj = { id: "own", name: "Own", systemPrompt: "", prompt: "Translate into {{targetLanguage}}.\n\n{{#webSummary}}Summary: {{webSummary}}{{/webSummary}}\n\n{{input}}" }

    const result = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input: "Hello", context: { webTitle: "Docs" } })

    expect(result.prompt).toBe("Translate into Spanish.\n\nHello")
  })

  it("user translates a page whose title has a template token: Given the title \"Passing {{input}} to helpers\", When a paragraph is translated with a custom prompt, Then the title reaches the model unchanged", () => {
    const own: TranslatePromptObj = { id: "own", name: "Own", systemPrompt: "", prompt: "Page: {{webTitle}}\n{{input}}" }

    const result = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input: "Hello", context: { webTitle: "Passing {{input}} to helpers" } })

    expect(result.prompt).toBe("Page: Passing {{input}} to helpers\nHello")
  })

  it("user translates text with dollar signs: Given $' and $$ in the paragraph, When it is translated with a custom prompt, Then the paragraph reaches the model unchanged", () => {
    const own: TranslatePromptObj = { id: "own", name: "Own", systemPrompt: "", prompt: "Translate:\n{{input}}\nEnd" }
    const input = "Use $' in sed. It costs US$$5."

    const result = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input })

    expect(result.prompt).toBe(`Translate:\n${input}\nEnd`)
  })

  it("user writes a prompt with {{batchRule}}: Given the token in their own prompt, When a batch is translated, Then the rule replaces the token and the system prompt gets no English rules", () => {
    const own: TranslatePromptObj = { id: "own", name: "Own", systemPrompt: "Be brief.", prompt: "Translate into {{targetLanguage}}.\n{{batchRule}}\n\n{{input}}" }

    const batch = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input: "A", isBatch: true })
    const single = translatePrompt({ patterns: [own], promptId: own.id, targetCode: "spa", input: "A" })

    expect(batch).toEqual({ systemPrompt: "Be brief.", prompt: `Translate into Spanish.\n${BATCH_RULE_TEXT.en}\n\nA` })
    expect(single).toEqual({ systemPrompt: "Be brief.", prompt: "Translate into Spanish.\n\nA" })
  })

  it("user deleted the selected prompt: Given the prompt id is not in the list, When they translate, Then the default prompt is used", () => {
    const result = translatePrompt({ promptId: "deleted", targetCode: "cmn" })

    expect(result.prompt).toBe("将以下文本翻译为简体中文，注意只需要输出翻译后的结果，不要额外解释：\n\nHello world")
  })
})
