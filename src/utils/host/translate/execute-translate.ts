import type { PromptResolver } from "./api/ai"
import type { Config } from "@/types/config/config"
import type { ProviderConfig } from "@/types/config/provider"
import type { ThinkingFallback } from "@/utils/providers/thinking-fallback"
import { isLLMProviderConfig } from "@/types/config/provider"
import { runWithThinkingFallback } from "@/utils/providers/thinking-fallback"
import { aiTranslate } from "./api/ai"
import { prepareTranslationText } from "./text-preparation"

export async function executeTranslate<TContext>(
  text: string,
  langConfig: Config["language"],
  providerConfig: ProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: {
    forceBackgroundFetch?: boolean
    isBatch?: boolean
    context?: TContext
    /** Called when the request worked only with the thinking fallback options. */
    onThinkingFallback?: (fallback: ThinkingFallback) => unknown
  },
) {
  const preparedText = prepareTranslationText(text)
  if (preparedText === "") {
    return ""
  }

  const { provider } = providerConfig
  let translatedText = ""

  if (isLLMProviderConfig(providerConfig)) {
    const { result, fallback } = await runWithThinkingFallback(providerConfig, config =>
      aiTranslate(preparedText, langConfig.targetCode, config, promptResolver, options))
    translatedText = result
    if (fallback)
      await options?.onThinkingFallback?.(fallback)
  }
  else {
    throw new Error(`Unknown provider: ${provider}`)
  }

  return translatedText.trim()
}
