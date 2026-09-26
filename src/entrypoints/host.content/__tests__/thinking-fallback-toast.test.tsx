// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react"
import { Toaster } from "sonner"
import { afterEach, beforeEach, expect, it } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"
import { listenForThinkingFallback } from "../thinking-fallback-toast"

let stop = () => {}

beforeEach(() => {
  fakeBrowser.reset()
  render(<Toaster />)
})

afterEach(() => {
  stop()
})

async function reportFallback() {
  await act(async () => {
    const results = await fakeBrowser.runtime.onMessage.trigger(
      { id: 1, type: "notifyThinkingFallback", timestamp: 0, data: { reason: "Invalid option" } },
      {},
      () => {},
    )
    await Promise.all(results)
  })
}

it("user translates a page after the service rejected the preset: Given the top frame, When the background reports the fallback, Then the page tells why", async () => {
  stop = listenForThinkingFallback(true)

  await reportFallback()

  expect(await screen.findByText("translation.thinkingFallback")).toBeInTheDocument()
})

it("user translates a page with frames: Given a frame, When the content script starts, Then the frame does not listen for the fallback, so only the top frame shows it", () => {
  stop = listenForThinkingFallback(false)

  expect(fakeBrowser.runtime.onMessage.hasListeners()).toBe(false)
})
