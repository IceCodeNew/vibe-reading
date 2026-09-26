import { z } from "zod"
import { isDomainPromptId } from "@/utils/constants/prompt"
import { MAX_PRELOAD_MARGIN, MAX_PRELOAD_THRESHOLD, MIN_BATCH_CHARACTERS, MIN_BATCH_ITEMS, MIN_CHARACTERS_PER_NODE, MIN_PRELOAD_MARGIN, MIN_PRELOAD_THRESHOLD, MIN_TRANSLATE_CAPACITY, MIN_TRANSLATE_RATE, MIN_WORDS_PER_NODE } from "@/utils/constants/translate"
import { TRANSLATION_NODE_STYLE } from "@/utils/constants/translation-node-style"
import { isPageTranslationShortcutEmpty, isValidConfiguredPageTranslationShortcut } from "@/utils/page-translation-shortcut"

export const requestQueueConfigSchema = z.object({
  capacity: z.number().gte(MIN_TRANSLATE_CAPACITY),
  rate: z.number().gte(MIN_TRANSLATE_RATE),
})

export const batchQueueConfigSchema = z.object({
  maxCharactersPerBatch: z.number().gte(MIN_BATCH_CHARACTERS),
  maxItemsPerBatch: z.number().gte(MIN_BATCH_ITEMS),
})

export const TRANSLATION_MODES = ["bilingual", "translationOnly"] as const
export const translationModeSchema = z.enum(TRANSLATION_MODES)

export const pageTranslateRangeSchema = z.enum(["main", "all"])
export type PageTranslateRange = z.infer<typeof pageTranslateRangeSchema>

export const preloadConfigSchema = z.object({
  margin: z.number().min(MIN_PRELOAD_MARGIN).max(MAX_PRELOAD_MARGIN),
  threshold: z.number().min(MIN_PRELOAD_THRESHOLD).max(MAX_PRELOAD_THRESHOLD),
})
export type PreloadConfig = z.infer<typeof preloadConfigSchema>

// Translation node style preset (excluding 'custom' - controlled by isCustom flag)
export const translationNodeStylePresetSchema = z.enum(TRANSLATION_NODE_STYLE)
export type TranslationNodeStylePreset = z.infer<typeof translationNodeStylePresetSchema>

export const MAX_CUSTOM_CSS_LENGTH = 8192

// Translation node style configuration
export const translationNodeStyleConfigSchema = z.object({
  preset: translationNodeStylePresetSchema,
  isCustom: z.boolean(),
  customCSS: z.string()
    .max(MAX_CUSTOM_CSS_LENGTH, "Custom CSS cannot exceed 8KB")
    .nullable(),
})

export type TranslationNodeStyleConfig = z.infer<typeof translationNodeStyleConfigSchema>

export const PROMPT_LANGUAGE_SETTINGS = ["auto", "en", "zh"] as const
export const promptLanguageSettingSchema = z.enum(PROMPT_LANGUAGE_SETTINGS)
export type PromptLanguageSetting = z.infer<typeof promptLanguageSettingSchema>
export type PromptLanguage = Exclude<PromptLanguageSetting, "auto">
export const PROMPT_LANGUAGES = ["en", "zh"] as const satisfies readonly PromptLanguage[]

export const translatePromptObjSchema = z.object({
  name: z.string(),
  id: z.string(),
  systemPrompt: z.string(),
  prompt: z.string(),
  /** The language of the prompt text. Without it, the prompt language setting applies. */
  promptLanguage: z.enum(PROMPT_LANGUAGES).optional(),
})
export type TranslatePromptObj = z.infer<typeof translatePromptObjSchema>

export const customPromptsConfigSchema = z.object({
  promptId: z.string().nullable(),
  patterns: z.array(
    translatePromptObjSchema,
  ),
}).superRefine((data, ctx) => {
  if (data.promptId !== null) {
    const patternIds = data.patterns.map(p => p.id)
    if (!patternIds.includes(data.promptId) && !isDomainPromptId(data.promptId)) {
      ctx.addIssue({
        code: "invalid_value",
        values: patternIds,
        message: `promptId "${data.promptId}" must be null, a built-in domain prompt id, or match a pattern id`,
        path: ["promptId"],
      })
    }
  }
})

export const pageTranslationShortcutSchema = z.string().superRefine((shortcut, ctx) => {
  if (isPageTranslationShortcutEmpty(shortcut)) {
    return
  }

  if (!isValidConfiguredPageTranslationShortcut(shortcut)) {
    ctx.addIssue({
      code: "custom",
      message: "Page translation shortcut must include at least one modifier key and one non-modifier key.",
    })
  }
})

export const translateConfigSchema = z.object({
  providerId: z.string().nonempty(),
  mode: translationModeSchema,
  page: z.object({
    range: pageTranslateRangeSchema,
    shortcut: pageTranslationShortcutSchema,
    preload: preloadConfigSchema,
    minCharactersPerNode: z.number().min(MIN_CHARACTERS_PER_NODE),
    minWordsPerNode: z.number().min(MIN_WORDS_PER_NODE),
  }),
  enableAIContentAware: z.boolean(),
  customPromptsConfig: customPromptsConfigSchema,
  promptLanguage: promptLanguageSettingSchema.default("auto"),
  requestQueueConfig: requestQueueConfigSchema,
  batchQueueConfig: batchQueueConfigSchema,
  translationNodeStyle: translationNodeStyleConfigSchema,
})

export type RequestQueueConfig = z.infer<typeof requestQueueConfigSchema>
export type BatchQueueConfig = z.infer<typeof batchQueueConfigSchema>
export type TranslateConfig = z.infer<typeof translateConfigSchema>
export type TranslationMode = z.infer<typeof translationModeSchema>
