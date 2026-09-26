import { toast } from "sonner"
import { i18n } from "#imports"
import { onMessage } from "@/utils/message"

/**
 * Shows why the background changed the provider options, after the provider
 * rejected the preset. Only the top frame shows it, so a page with frames
 * shows it once. Returns the function that stops the listener.
 */
export function listenForThinkingFallback(isTopFrame: boolean): () => void {
  if (!isTopFrame)
    return () => {}
  return onMessage("notifyThinkingFallback", (msg) => {
    toast.info(i18n.t("translation.thinkingFallback", [msg.data.reason]), { duration: 15_000 })
  })
}
