import type { TranslatePromptObj } from "@/types/config/translate"
import type { DomainPromptId } from "@/utils/constants/prompt"
import { useAtom, useAtomValue } from "jotai"
import { useId } from "react"
import { i18n } from "#imports"
import { configFieldsAtomMap } from "@/utils/atoms/config"
import { DEFAULT_TRANSLATE_PROMPT_ID, DOMAIN_PROMPT_IDS, isBuiltinPromptId, isDomainPromptId, renderBuiltinPromptTemplate } from "@/utils/constants/prompt"
import { resolvePromptLanguage } from "@/utils/prompts/prompt-language"
import { cn } from "@/utils/styles/utils"
import { ConfigurePrompt } from "./configure-prompt"
import { usePromptAtoms } from "./context"
import { DeletePrompt } from "./delete-prompt"
import { ExportPrompts } from "./export-prompts"
import { ImportPrompts } from "./import-prompts"

const DOMAIN_PROMPT_LABEL_KEY = {
  "builtin:legal": "options.quality.prompts.builtins.legal",
  "builtin:medical": "options.quality.prompts.builtins.medical",
  "builtin:finance": "options.quality.prompts.builtins.finance",
  "builtin:technology": "options.quality.prompts.builtins.technology",
} as const satisfies Record<DomainPromptId, string>

/**
 * Prompts as a radio list: the default one first, then the domain prompts,
 * then the reader's own. The chosen prompt is what page translation sends to the model.
 */
export function PromptList() {
  const promptAtoms = usePromptAtoms()
  const [config, setConfig] = useAtom(promptAtoms.config)
  const radioGroupId = useId()

  const { promptLanguage: promptLanguageSetting, enableAIContentAware } = useAtomValue(configFieldsAtomMap.translate)
  const { targetCode } = useAtomValue(configFieldsAtomMap.language)
  const promptLanguage = resolvePromptLanguage(promptLanguageSetting, targetCode)

  // Built-in prompts are shown as the template the model receives for one paragraph
  // with the current settings.
  const builtinPrompt = (id: string, name: string): TranslatePromptObj => ({
    id,
    name,
    systemPrompt: "",
    // A copy keeps the language of this text.
    promptLanguage,
    prompt: renderBuiltinPromptTemplate({
      promptLanguage,
      domainId: isDomainPromptId(id) ? id : undefined,
      withSummary: enableAIContentAware,
    }),
  })
  const prompts = [
    builtinPrompt(DEFAULT_TRANSLATE_PROMPT_ID, i18n.t("options.quality.prompts.default")),
    ...DOMAIN_PROMPT_IDS.map(id => builtinPrompt(id, i18n.t(DOMAIN_PROMPT_LABEL_KEY[id]))),
    ...config.patterns,
  ]

  const select = (prompt: TranslatePromptObj) => {
    setConfig({
      ...config,
      promptId: prompt.id === DEFAULT_TRANSLATE_PROMPT_ID ? null : prompt.id,
    })
  }

  return (
    <div className="flex flex-col gap-2.5 px-4 py-3.5">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-medium">{i18n.t("options.quality.prompts.title")}</div>
        <div className="flex items-center gap-3 text-xs">
          <ImportPrompts />
          <ExportPrompts />
          <ConfigurePrompt />
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {prompts.map((prompt) => {
          const isDefault = prompt.id === DEFAULT_TRANSLATE_PROMPT_ID
          const isActive = isDefault ? config.promptId === null : config.promptId === prompt.id
          const inputId = `${radioGroupId}-${prompt.id}`

          return (
            <div
              key={prompt.id}
              className={cn("flex items-center gap-2.5 rounded-lg px-2.5 py-2", isActive && "bg-muted")}
            >
              <input
                type="radio"
                id={inputId}
                name={radioGroupId}
                checked={isActive}
                onChange={() => select(prompt)}
                className="size-3.5 cursor-pointer accent-primary"
              />
              <label htmlFor={inputId} className="min-w-0 flex-1 cursor-pointer truncate text-[13px]" title={prompt.name}>
                {prompt.name}
              </label>
              <div className="flex shrink-0 items-center gap-3 text-xs">
                {!isBuiltinPromptId(prompt.id) && <DeletePrompt originPrompt={prompt} />}
                <ConfigurePrompt originPrompt={prompt} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
