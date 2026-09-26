import type { JSONValue } from "ai"
import type { APIProviderConfig } from "@/types/config/provider"
import type { ThinkingFallback } from "@/utils/providers/thinking-fallback"
import { IconCheck, IconX } from "@tabler/icons-react"
import { useMutation } from "@tanstack/react-query"
import { dequal } from "dequal"
import { useEffect } from "react"
import { toast } from "sonner"
import { i18n } from "#imports"
import LoadingDots from "@/components/loading-dots"
import { Button } from "@/components/ui/base-ui/button"
import { getObjectWithoutAPIKeys } from "@/utils/config/api"
import { DEFAULT_CONFIG } from "@/utils/constants/config"
import { executeTranslate } from "@/utils/host/translate/execute-translate"
import { getTranslatePrompt } from "@/utils/prompts/translate"

function ConnectionSuccessIcon() {
  return (
    <div className="flex items-center justify-center size-5 rounded-full bg-green-200 dark:bg-green-800/50">
      <IconCheck className="size-3.5 text-green-700 dark:text-green-300 stroke-[2.5]" />
    </div>
  )
}

function ConnectionErrorIcon() {
  return (
    <div className="flex items-center justify-center size-5 rounded-full bg-red-200 dark:bg-red-800/50">
      <IconX className="size-3.5 text-red-700 dark:text-red-300 stroke-[2.5]" />
    </div>
  )
}

const ConnectionTestResultIconMap = {
  success: <ConnectionSuccessIcon />,
  error: <ConnectionErrorIcon />,
}

/**
 * Tests the provider with one short translation. When a custom provider
 * rejects the preset `reasoningEffort: "none"`, it tries the DeepSeek switch
 * that turns off thinking. If that works and the user did not change the
 * provider options during the test, it saves the new provider options and
 * tells the user why.
 */
export function ConnectionTestButton({ providerConfig, onProviderOptionsChange }: {
  providerConfig: APIProviderConfig
  onProviderOptionsChange: (options: Record<string, JSONValue>) => void
}) {
  const { apiKey, provider, providerOptions } = providerConfig
  const baseURL = "baseURL" in providerConfig ? providerConfig.baseURL : undefined

  const mutation = useMutation({
    // for safety, we should not include apiKey in the mutationKey.
    // A new key clears the result. The provider options are not in it, because
    // the fallback saves new provider options after a test that used the old ones.
    mutationKey: ["apiConnection", getObjectWithoutAPIKeys({ ...providerConfig, providerOptions: undefined })],
    mutationFn: async (_testedOptions: Record<string, JSONValue> | undefined) => {
      let fallback: ThinkingFallback | undefined
      await executeTranslate("Hi", DEFAULT_CONFIG.language, providerConfig, getTranslatePrompt, {
        onThinkingFallback: (used) => {
          fallback = used
        },
      })
      return fallback
    },
    onSuccess: (fallback, testedOptions) => {
      if (!fallback || !dequal(providerOptions, testedOptions))
        return
      onProviderOptionsChange(fallback.options)
      toast.info(i18n.t("options.providers.form.testConnection.thinkingFallback", [fallback.reason]), { duration: 15_000 })
    },
  })

  const handleTestConnection = () => {
    mutation.mutate(providerOptions)
  }

  useEffect(() => {
    mutation.reset()
  // eslint-disable-next-line react/exhaustive-deps
  }, [provider, apiKey, baseURL])

  // A result is for the provider options that the test used; after the user changes them, it is hidden.
  const resultOptions = mutation.data?.options ?? mutation.variables
  const testResult = !dequal(providerOptions, resultOptions) ? null : mutation.isSuccess ? "success" : mutation.isError ? "error" : null
  const ConnectionTestResultIcon = testResult ? ConnectionTestResultIconMap[testResult] : null

  return (
    <div className="flex items-center gap-2">
      {ConnectionTestResultIcon}
      <Button
        size="xs"
        variant="outline"
        onClick={handleTestConnection}
        disabled={mutation.isPending || !apiKey}
      >
        {mutation.isPending
          ? (
              <div className="flex items-center gap-2">
                <LoadingDots className="scale-75" />
                <span className="text-xs">
                  {i18n.t("options.providers.form.testConnection.testing")}
                </span>
              </div>
            )
          : (
              <span className="text-xs">
                {i18n.t("options.providers.form.testConnection.button")}
              </span>
            )}
      </Button>
    </div>
  )
}
