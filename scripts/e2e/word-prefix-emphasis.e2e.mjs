/* global chrome -- page.evaluate() runs these callbacks in the extension page. */
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { createServer } from "node:http"
import { after, before, it } from "node:test"
import { capture, launchBrowser, listenOnLocalPort, waitForText } from "./browser.mjs"

const SWITCH = "Word-prefix emphasis"
const text = "Reading unfamiliar words takes practice. Keep the whole sentence in view."
const translated = "Une lecture attentive préserve le sens."
const requests = []
// Tab switches start page language detection; count only translation requests.
const translationRequests = () => requests.filter(body => !JSON.stringify(body.messages).includes("language detection assistant"))
let context
let article
let options
let pageURL

const articlePage = `<!doctype html><html lang="en"><head><title>Reading preferences</title>
  <style>body { font: 20px/1.8 system-ui; max-width: 760px; margin: 70px auto; color: #253044; background: #faf9f6; }
  h1 { font-size: 32px; } pre, textarea { font-size: 16px; } a { color: #285bb0; }</style></head>
  <body><h1>A quiet moment to read</h1><article><p id="passage">${text}</p>
  <p id="mixed">Café naïve élan. 中文和日本語保持原样。 <a id="link" href="#note">Read the note</a>.</p>
  <pre id="code">const message = "Keep code unchanged";</pre>
  <p contenteditable="true" id="editor">Editable words stay unchanged.</p>
  <p id="note">Choose the presentation that feels comfortable.</p></article></body></html>`

// Rules copied from https://silo.pgsty.com/ (css/landing-v3.css and css/silo-v3.css), which
// stacked every prefix on its own line or split words into spaced flex items.
const landingPage = `<!doctype html><html lang="en"><head><title>Landing page</title>
  <style>body { font: 18px/1.6 system-ui; margin: 40px; width: 900px; }
  .hero-sub span { display: block; }
  .board-top, .board-foot { display: flex; justify-content: space-between; gap: 18px; font-family: monospace; letter-spacing: 0.12em; }
  .board-top span, .board-foot span:last-child { display: inline-flex; align-items: center; gap: 8px; }
  /* A tag-independent variant of the same rule. */
  .board-top :last-child { display: inline-flex; gap: 8px; }</style></head>
  <body><p class="hero-sub" id="hero"><span>PGSTY SILO is a MinIO fork maintained by volunteers.</span><span>Provide packages and fixes.</span></p>
  <div class="board-top" id="top"><span>STORAGE NODE</span><span>PGSTY</span></div>
  <div class="board-foot" id="foot"><span>COMMUNITY FORK</span><span>MAINTAINED BY PIGSTY</span></div></body></html>`

const server = createServer(async (request, response) => {
  if (request.url === "/v1/chat/completions" && request.method === "POST") {
    const chunks = []
    for await (const chunk of request)
      chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push(body)
    // OpenAI Chat Completions wire contract, also used by compatible providers:
    // https://platform.openai.com/docs/api-reference/chat/create
    if (body.model !== "reading-test" || !Array.isArray(body.messages) || body.stream) {
      response.writeHead(400).end()
      return
    }
    // A batch request puts a "%%" line between its texts; answer each text in the same format.
    const texts = body.messages.at(-1).content.split(/\n[ \t]*%%[ \t]*\n/).length
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({
      id: "chatcmpl-reading-test",
      object: "chat.completion",
      created: 1,
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: Array.from({ length: texts }).fill(translated).join("\n\n%%\n\n") }, finish_reason: "stop" }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }))
    return
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(request.url.startsWith("/landing") ? landingPage : articlePage)
})

/** Brings the tab to the front, which the extension handles like a user switching tabs. */
async function show(page) {
  await page.bringToFront()
  return page
}

async function switchLocator() {
  await show(options)
  return options.getByRole("switch", { name: SWITCH, exact: true })
}

/** Sets the emphasis switch in the settings tab, and clicks it only when its state differs. */
async function setEmphasis(on) {
  const toggle = await switchLocator()
  if (await toggle.getAttribute("aria-checked") !== String(on))
    await toggle.click()
  await options.getByRole("switch", { name: SWITCH, exact: true, checked: on }).waitFor()
}

async function setTranslationMode(mode) {
  await show(options)
  await options.evaluate(async (mode) => {
    const { config } = await chrome.storage.local.get("config")
    config.translate.mode = mode
    await chrome.storage.local.set({ config })
  }, mode)
}

before(async () => {
  await listenOnLocalPort(server)
  pageURL = `http://127.0.0.1:${server.address().port}`
  let extensionId
  ;({ context, page: article, extensionId } = await launchBrowser())
  await article.setViewportSize({ width: 1100, height: 850 })
  await article.goto(pageURL)
  options = await context.newPage()
  await options.goto(`chrome-extension://${extensionId}/options.html#reading`)
  await waitForText(options, SWITCH)
  // Use a real local HTTP provider; the extension's transport, storage and translation run unchanged.
  await options.evaluate(async (baseURL) => {
    const { config } = await chrome.storage.local.get("config")
    const provider = config.providersConfig.find(p => p.provider === "openai-compatible")
    provider.baseURL = baseURL
    provider.apiKey = "local-test-key"
    provider.model = "reading-test"
    config.language = { ...config.language, sourceCode: "eng", targetCode: "fra" }
    config.translate.providerId = provider.id
    await chrome.storage.local.set({ config })
  }, `${pageURL}/v1`)
})

after(async () => {
  await context.close()
  await new Promise(resolve => server.close(resolve))
})

it("user chooses word-prefix emphasis: Given normal text, When it is toggled in the settings, Then pages update, preserve content and restore without reload", async () => {
  // Given
  await show(article)
  assert.equal(await article.locator("plainly-prefix").count(), 0)
  await capture(article, "prefix-off")

  // When: keyboard access on the first toggle
  const toggle = await switchLocator()
  assert.equal(await toggle.getAttribute("aria-checked"), "false")
  await toggle.focus()
  await options.keyboard.press("Space")
  await show(article)

  // Then
  await article.locator("#passage plainly-prefix").first().waitFor({ state: "attached" })
  assert.equal(await article.locator("#passage").textContent(), text)
  assert.equal(await article.locator("#passage plainly-prefix").first().textContent(), "Read")
  assert.equal(await article.locator("#passage plainly-prefix").first().evaluate(element => getComputedStyle(element).fontWeight), "700")
  assert.equal(await article.locator("#code plainly-prefix, #editor plainly-prefix").count(), 0)
  await article.locator("#link").click()
  assert.equal(await article.evaluate(() => location.hash), "#note")
  await capture(article, "prefix-on")
  await article.evaluate(() => document.querySelector("#passage").textContent = "Updated reading material.")
  await article.waitForFunction(() => document.querySelector("#passage plainly-prefix")?.textContent === "Upda")
  await article.reload()
  await article.locator("#passage plainly-prefix").first().waitFor({ state: "attached" })

  // When disabled with the pointer, Then the original markup returns
  await setEmphasis(false)
  await show(article)
  await article.locator("plainly-prefix").first().waitFor({ state: "detached" })
  assert.equal(await article.locator("#passage").innerHTML(), text)
  await article.evaluate(() => document.querySelector("#passage").textContent = "Updates remain plain.")
  assert.equal(await article.evaluate(() => document.querySelector("#passage").children.length), 0)
})

it("user keeps the page layout: Given page CSS for every span and last child, When emphasis is enabled, Then lines, flex items and word spacing stay the same", async () => {
  // Given
  await show(article)
  await article.goto(`${pageURL}/landing`)
  const measure = () => ["#hero", "#top", "#foot"].map((selector) => {
    const element = document.querySelector(selector)
    const range = document.createRange()
    range.selectNodeContents(element)
    return { lines: new Set([...range.getClientRects()].map(rect => Math.round(rect.top))).size, height: Math.round(element.getBoundingClientRect().height), items: element.children.length }
  })
  const before = await article.evaluate(measure)

  // When
  await setEmphasis(true)
  await show(article)
  await article.locator("#hero plainly-prefix").first().waitFor({ state: "attached" })
  await article.locator("#foot plainly-prefix").first().waitFor({ state: "attached" })
  await capture(article, "prefix-landing")

  // Then
  const after = await article.evaluate(measure)
  assert.deepEqual(after.map(({ lines, items }) => ({ lines, items })), before.map(({ lines, items }) => ({ lines, items })))
  for (const [index, { height }] of after.entries())
    assert.ok(Math.abs(height - before[index].height) <= 1, `height of block ${index} changed from ${before[index].height} to ${height}`)
  // A text wrapper that is a flex item is blockified like the anonymous item it replaces; prefixes stay inline.
  assert.deepEqual(await article.evaluate(() => [...new Set([...document.querySelectorAll("plainly-prefix")].map(element => getComputedStyle(element).display))]), ["inline"])
  assert.equal(await article.locator("#foot").textContent(), "COMMUNITY FORKMAINTAINED BY PIGSTY")

  await setEmphasis(false)
  await show(article)
  await article.locator("plainly-prefix").first().waitFor({ state: "detached" })
})

for (const mode of ["translationOnly", "bilingual"]) {
  it(`user restores ${mode} text: Given emphasis and translation, When emphasis is disabled before showing originals, Then original text returns without emphasis markup`, async () => {
    // Given
    await setTranslationMode(mode)
    await setEmphasis(true)
    await show(article)
    await article.goto(`${pageURL}/?mode=${mode}`)
    await article.locator("#passage plainly-prefix").first().waitFor({ state: "attached" })

    // When
    await article.keyboard.press("Alt+e")
    await article.locator("#passage .plainly-translated-content-wrapper").filter({ hasText: translated }).waitFor({ state: "attached" })
    await article.locator("#passage .plainly-translated-content-wrapper plainly-prefix").first().waitFor({ state: "attached" })
    assert.ok(translationRequests().length > 0)
    assert.ok(!JSON.stringify(requests).includes("plainly-prefix"))
    await setEmphasis(false)
    await show(article)
    await article.locator("plainly-prefix").first().waitFor({ state: "detached" })
    await article.keyboard.press("Alt+e")

    // Then
    await article.locator(".plainly-translated-content-wrapper").first().waitFor({ state: "detached" })
    assert.equal(await article.locator("#passage").textContent(), text)
    assert.equal(await article.locator("plainly-prefix-text, plainly-prefix").count(), 0)
  })
}

it("user enables emphasis on a translated page: Given a bilingual translation, When emphasis is enabled, Then each paragraph keeps one translation and its original text", async () => {
  // Given
  await setTranslationMode("bilingual")
  await setEmphasis(false)
  await show(article)
  await article.goto(`${pageURL}/?translated-first`)
  await waitForText(article, "A quiet moment to read")
  await article.keyboard.press("Alt+e")
  await article.waitForFunction(() => ["#passage", "#mixed", "#note"].every(selector => document.querySelector(`${selector} .plainly-translated-content-wrapper`)?.textContent.trim()))
  const requestCount = translationRequests().length

  // When
  await setEmphasis(true)
  await show(article)
  await article.locator("#passage .plainly-translated-content-wrapper plainly-prefix").first().waitFor({ state: "attached" })
  // No DOM signal proves that a request did not start, so allow one bounded window for it.
  await article.waitForTimeout(1500)

  // Then
  assert.equal(await article.locator("#passage .plainly-translated-content-wrapper").count(), 1)
  assert.equal(translationRequests().length, requestCount)
  await setEmphasis(false)
  await show(article)
  await article.locator("plainly-prefix").first().waitFor({ state: "detached" })
  await article.keyboard.press("Alt+e")
  await article.locator(".plainly-translated-content-wrapper").first().waitFor({ state: "detached" })
  assert.equal(await article.locator("#passage").textContent(), text)
})
