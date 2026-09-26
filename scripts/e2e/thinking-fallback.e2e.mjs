/* global chrome -- page.evaluate() runs these callbacks in the extension page. */
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { createServer } from "node:http"
import { after, before, it } from "node:test"
import { launchBrowser, waitForText } from "./browser.mjs"

const text = "The supplier shall indemnify the customer."
const translated = "Le fournisseur indemnisera le client."
const gatewayError = "Invalid option: expected one of \"low\"|\"medium\"|\"high\"|\"xhigh\"|\"max\""
const receivedOptions = []
let context
let article
let options
let pageURL

// A gateway in front of DeepSeek V4.1 Flash. It uses the OpenAI Chat
// Completions wire contract and rejects reasoning_effort "none" with the
// reported message: https://platform.openai.com/docs/api-reference/chat/create
const server = createServer(async (request, response) => {
  if (request.url === "/v1/chat/completions" && request.method === "POST") {
    const chunks = []
    for await (const chunk of request)
      chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    response.setHeader("Content-Type", "application/json")
    if (JSON.stringify(body.messages).includes("language detection assistant")) {
      response.end(JSON.stringify({ id: "c", object: "chat.completion", created: 1, model: body.model, choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ reason: "English", code: "eng" }) }, finish_reason: "stop" }] }))
      return
    }
    receivedOptions.push({ reasoning_effort: body.reasoning_effort, thinking: body.thinking })
    if (body.reasoning_effort === "none") {
      response.writeHead(400).end(JSON.stringify({ error: { message: gatewayError } }))
      return
    }
    const texts = body.messages.at(-1).content.split(/\n[ \t]*%%[ \t]*\n/).length
    response.end(JSON.stringify({
      id: "chatcmpl-fallback-test",
      object: "chat.completion",
      created: 1,
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: Array.from({ length: texts }).fill(translated).join("\n\n%%\n\n") }, finish_reason: "stop" }],
    }))
    return
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(`<!doctype html><html lang="en"><head><title>Agreement</title></head><body><p id="clause">${text}</p></body></html>`)
})

before(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  pageURL = `http://127.0.0.1:${server.address().port}`
  let extensionId
  ;({ context, page: article, extensionId } = await launchBrowser())
  options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html#providers`)
  await waitForText(options, "DeepSeek")
  // A new custom provider keeps its preset provider options; the user never tests the connection.
  await options.evaluate(async (baseURL) => {
    const { config } = await chrome.storage.local.get("config")
    const provider = config.providersConfig.find(p => p.provider === "openai-compatible")
    Object.assign(provider, { baseURL, apiKey: "local-test-key", model: "deepseek-v4.1-flash", providerOptions: { reasoningEffort: "none", topK: 20 } })
    config.language = { ...config.language, sourceCode: "eng", targetCode: "fra" }
    config.translate.providerId = provider.id
    await chrome.storage.local.set({ config })
  }, `${pageURL}/v1`)
})

after(async () => {
  await context?.close()
  await new Promise(resolve => server.close(resolve))
})

it("user translates a page with a new custom provider behind a strict gateway: Given the preset reasoningEffort none and no connection test, When the page is translated, Then the page is translated, the page tells why, and the provider options use the thinking switch", async () => {
  // When
  await article.bringToFront()
  await article.goto(pageURL)
  await waitForText(article, text)
  await article.keyboard.press("Alt+e")

  // Then
  await article.locator("#clause .plainly-translated-content-wrapper", { hasText: translated }).waitFor()
  await article.getByText("and translations send it", { exact: false }).waitFor()
  // Requests for the title and the text run in parallel, so the order varies.
  assert.ok(receivedOptions.some(options => options.reasoning_effort === "none"))
  assert.ok(receivedOptions.some(options => options.reasoning_effort === undefined && options.thinking?.type === "disabled"))
  const saved = await options.evaluate(async () => (await chrome.storage.local.get("config")).config.providersConfig.find(p => p.provider === "openai-compatible").providerOptions)
  assert.deepEqual(saved, { topK: 20, thinking: { type: "disabled" } })
})
