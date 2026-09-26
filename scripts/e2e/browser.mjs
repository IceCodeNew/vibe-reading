import { mkdir } from "node:fs/promises"
import { resolve } from "node:path"
import process from "node:process"
import { chromium } from "playwright-core"

export const extensionPath = resolve(".output/chrome-mv3")

/**
 * Starts headless Chromium with the built extension and a new profile.
 * Returns the browser context, its first page and the extension ID.
 */
export async function launchBrowser() {
  // An empty path makes Playwright create a temporary profile and delete it on close.
  const context = await chromium.launchPersistentContext("", {
    // Headless Chromium loads extensions; the headless shell does not.
    channel: "chromium",
    headless: true,
    acceptDownloads: true,
    locale: "en-US",
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  })
  const worker = context.serviceWorkers()[0] ?? await context.waitForEvent("serviceworker")
  const page = context.pages()[0] ?? await context.newPage()
  return { context, page, extensionId: new URL(worker.url()).host }
}

/** Clicks the button whose accessible name is exactly `name`. */
export async function clickButton(page, name) {
  await page.getByRole("button", { name, exact: true }).click()
}

/** Waits until `text` is visible on the page. */
export async function waitForText(page, text) {
  await page.getByText(text).first().waitFor()
}

/** Saves a screenshot when E2E_SCREENSHOTS names a directory. */
export async function capture(page, name) {
  if (process.env.E2E_SCREENSHOTS) {
    await mkdir(process.env.E2E_SCREENSHOTS, { recursive: true })
    await page.screenshot({ path: resolve(process.env.E2E_SCREENSHOTS, `${name}.png`) })
  }
}

// Chromium refuses these ports with ERR_UNSAFE_PORT (net/base/port_util.cc).
// Only ports above 1023 are here, because the system never assigns lower ones.
const UNSAFE_PORTS = new Set([1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6679, 6697, 10080])

/** Listens on a free local port that the browser can reach, and returns the port. */
export async function listenOnLocalPort(server) {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  const { port } = server.address()
  if (!UNSAFE_PORTS.has(port))
    return port
  await new Promise(resolve => server.close(resolve))
  return listenOnLocalPort(server)
}
