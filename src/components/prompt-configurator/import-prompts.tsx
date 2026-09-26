import type { PromptConfigList } from "./utils/prompt-file"
import { useAtom } from "jotai"
import { useId } from "react"
import { toast } from "sonner"
import { i18n } from "#imports"
import { getRandomUUID } from "@/utils/crypto-polyfill"
import { usePromptAtoms } from "./context"
import { analysisJSONFile } from "./utils/prompt-file"

export function ImportPrompts() {
  const promptAtoms = usePromptAtoms()
  const [config, setConfig] = useAtom(promptAtoms.config)
  const inputId = useId()

  const injectPrompts = (list: PromptConfigList) => {
    const patterns = list.map(item => ({ ...item, id: getRandomUUID() }))

    setConfig({
      ...config,
      patterns: [...config.patterns, ...patterns],
    })
  }

  const importPrompts = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const file = event.target.files?.[0]
      if (!file)
        return
      injectPrompts(await analysisJSONFile(file))
      toast.success(i18n.t("options.quality.prompts.importSuccess"))
    }
    catch (error) {
      toast.error(error instanceof Error ? error.message : i18n.t("options.quality.prompts.importFailed"))
    }
    finally {
      event.target.value = ""
    }
  }

  return (
    <>
      <label htmlFor={inputId} className="cursor-pointer text-muted-foreground hover:text-foreground hover:underline">
        {i18n.t("options.quality.prompts.import")}
      </label>
      <input
        type="file"
        id={inputId}
        className="hidden"
        accept=".json"
        onChange={event => void importPrompts(event)}
      />
    </>
  )
}
