import type { LangCodeISO6393 } from "@/definitions"
import type { LLMProviderConfig } from "@/types/config/provider"
import type { TranslatePromptOptions, TranslatePromptResult } from "@/utils/prompts/translate"
import { generateText } from "ai"
import { extractAISDKErrorMessage } from "@/utils/error/extract-message"
import { getModel } from "@/utils/providers/model"
import { getProviderOptionsWithOverride } from "@/utils/providers/options"
import { attachRequestErrorMeta, getRequestErrorMeta } from "@/utils/request/retry-policy"

const THINK_TAG_RE = /<\/think>([\s\S]*)/

export type PromptResolver<TContext = unknown> = (
  targetCode: LangCodeISO6393,
  input: string,
  options?: TranslatePromptOptions<TContext>,
) => Promise<TranslatePromptResult>

export async function aiTranslate<TContext>(
  text: string,
  targetCode: LangCodeISO6393,
  providerConfig: LLMProviderConfig,
  promptResolver: PromptResolver<TContext>,
  options?: { isBatch?: boolean, context?: TContext },
) {
  const { provider, providerOptions: userProviderOptions, temperature } = providerConfig
  const model = getModel(providerConfig)

  const providerOptions = getProviderOptionsWithOverride(provider, userProviderOptions)
  const { systemPrompt, prompt } = await promptResolver(targetCode, text, options)

  try {
    const { text: translatedText } = await generateText({
      model,
      // Built-in prompts have no system prompt. Some providers reject an empty one.
      system: systemPrompt || undefined,
      prompt,
      temperature,
      providerOptions,
      maxRetries: 0, // Disable SDK built-in retries, let RequestQueue/BatchQueue handle it
    })

    const [, finalTranslation = translatedText] = translatedText.match(THINK_TAG_RE) || []

    return finalTranslation
  }
  catch (error) {
    const message = extractAISDKErrorMessage(error)
    const meta = getRequestErrorMeta(error)
    if (error instanceof Error) {
      error.message = message
      throw attachRequestErrorMeta(error, meta)
    }

    throw attachRequestErrorMeta(new Error(message), meta)
  }
}
