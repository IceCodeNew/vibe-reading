import type { LangCodeISO6393 } from "@/definitions"
import type { PromptLanguage, PromptLanguageSetting } from "@/types/config/translate"
import { ISO6393_TO_6391, LANG_CODE_TO_EN_NAME } from "@/definitions"

// These codes map to "zh" in ISO6393_TO_6391, which Intl names only "中文".
const CHINESE_LANGUAGE_TAGS: Partial<Record<LangCodeISO6393, string>> = {
  "cmn": "zh-Hans",
  "cmn-Hant": "zh-Hant",
  "yue": "yue",
}

const chineseLanguageNames = new Intl.DisplayNames(["zh-Hans"], { type: "language" })

const HAN_TEXT = /\p{Script=Han}/u
// Japanese and Korean text can also have Han characters.
const KANA_OR_HANGUL_TEXT = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/**
 * The prompt language that a prompt text shows: Chinese when the text has
 * Han characters and no kana or Hangul, otherwise English. Earlier versions
 * named the target language in English for all custom prompts, so a prompt
 * in another language keeps English names.
 */
export function inferPromptLanguage(text: string): PromptLanguage {
  return HAN_TEXT.test(text) && !KANA_OR_HANGUL_TEXT.test(text) ? "zh" : "en"
}

/**
 * The language of the built-in prompts. "auto" selects Chinese prompts
 * when the translation target is a Chinese language.
 */
export function resolvePromptLanguage(setting: PromptLanguageSetting, targetCode: LangCodeISO6393): PromptLanguage {
  if (setting !== "auto") {
    return setting
  }
  return targetCode in CHINESE_LANGUAGE_TAGS ? "zh" : "en"
}

/**
 * The target language name in the language of the prompt. Intl has no
 * Chinese name for some rare languages; they keep their English name.
 */
export function getTargetLanguageName(targetCode: LangCodeISO6393, promptLanguage: PromptLanguage): string {
  const englishName = LANG_CODE_TO_EN_NAME[targetCode]
  if (promptLanguage === "en") {
    return englishName
  }

  const tag = CHINESE_LANGUAGE_TAGS[targetCode] ?? ISO6393_TO_6391[targetCode] ?? targetCode
  const chineseName = chineseLanguageNames.of(tag)
  return chineseName && chineseName !== tag ? chineseName : englishName
}
