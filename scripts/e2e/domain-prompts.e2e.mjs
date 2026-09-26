/* global chrome -- page.evaluate() runs these callbacks in the extension page. */
import assert from "node:assert/strict"
import { Buffer } from "node:buffer"
import { createServer } from "node:http"
import { after, before, beforeEach, it } from "node:test"
import { capture, launchBrowser, waitForText } from "./browser.mjs"

const title = "Master services agreement"
const text = "The supplier shall indemnify the customer against all third-party claims."
const translated = "Le fournisseur indemnisera le client."
const requests = []
// Tab switches start page language detection; count only translation requests.
const translationRequests = () => requests.filter(body => !JSON.stringify(body.messages).includes("language detection assistant"))
let context
let article
let options
let optionsURL
let pageURL

const articlePage = `<!doctype html><html lang="en"><head><title>${title}</title></head>
  <body><article><p id="clause">${text}</p></article></body></html>`

const server = createServer(async (request, response) => {
  if (request.url === "/v1/chat/completions" && request.method === "POST") {
    const chunks = []
    for await (const chunk of request)
      chunks.push(chunk)
    const body = JSON.parse(Buffer.concat(chunks).toString())
    requests.push(body)
    // OpenAI Chat Completions wire contract, also used by compatible providers:
    // https://platform.openai.com/docs/api-reference/chat/create
    // A batch request puts a "%%" line between its texts; answer each text in the same format.
    const texts = body.messages.at(-1).content.split(/\n[ \t]*%%[ \t]*\n/).length
    response.setHeader("Content-Type", "application/json")
    response.end(JSON.stringify({
      id: "chatcmpl-domain-test",
      object: "chat.completion",
      created: 1,
      model: body.model,
      choices: [{ index: 0, message: { role: "assistant", content: Array.from({ length: texts }).fill(translated).join("\n\n%%\n\n") }, finish_reason: "stop" }],
      usage: { prompt_tokens: 20, completion_tokens: 10, total_tokens: 30 },
    }))
    return
  }
  response.setHeader("Content-Type", "text/html; charset=utf-8")
  response.end(articlePage)
})

/** The row of one prompt in the prompt list. */
function promptRow(name) {
  return options.locator("div", { has: options.locator(`label[title="${name}"]`) }).last()
}

function promptLanguageChips() {
  return options.getByRole("group", { name: "Prompt language", exact: true })
}

async function choosePromptLanguage(name) {
  await promptLanguageChips().getByRole("button", { name, exact: true }).click()
  await promptLanguageChips().getByRole("button", { name, exact: true, pressed: true }).waitFor()
}

/** Opens the read-only view of a prompt and returns its prompt field. */
async function viewPrompt(name) {
  await promptRow(name).getByRole("button", { name: "View", exact: true }).click()
  const prompt = options.getByRole("dialog").locator("textarea.max-h-60")
  await prompt.waitFor()
  return prompt
}

async function closeDialog() {
  await options.keyboard.press("Escape")
  await options.getByRole("dialog").waitFor({ state: "detached" })
}

before(async () => {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  pageURL = `http://127.0.0.1:${server.address().port}`
  let extensionId
  ;({ context, page: article, extensionId } = await launchBrowser())
  optionsURL = `chrome-extension://${extensionId}/options.html#quality`
  await article.goto(pageURL)
  options = await context.newPage()
  await options.goto(optionsURL)
  await waitForText(options, "Prompt language")
  // Use a real local HTTP provider; the extension's transport, storage and translation run unchanged.
  await options.evaluate(async (baseURL) => {
    const { config } = await chrome.storage.local.get("config")
    const provider = config.providersConfig.find(p => p.provider === "openai-compatible")
    provider.baseURL = baseURL
    provider.apiKey = "local-test-key"
    provider.model = "domain-test"
    config.language = { ...config.language, sourceCode: "eng", targetCode: "fra" }
    config.translate.providerId = provider.id
    await chrome.storage.local.set({ config })
  }, `${pageURL}/v1`)
})

beforeEach(async () => {
  requests.length = 0
  // The extension keeps page translation on per tab, so each test starts in a new tab.
  await article.close()
  article = await context.newPage()
  await article.goto(pageURL)
  await options.bringToFront()
  await options.goto(optionsURL)
  await waitForText(options, "Prompt language")
  await choosePromptLanguage("Auto")
})

after(async () => {
  await context?.close()
  await new Promise(resolve => server.close(resolve))
})

it("user views a domain prompt: Given the target is French, When the user opens the legal prompt before and after choosing Chinese prompts, Then the read-only view follows the prompt language", async () => {
  // Given
  assert.equal(await promptRow("Legal").getByRole("button", { name: "Delete", exact: true }).count(), 0)

  // When the prompt language is Auto
  const english = await viewPrompt("Legal")

  // Then
  assert.equal(await english.isDisabled(), true)
  assert.match(await english.inputValue(), /formal legal language/)
  assert.equal(await options.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).count(), 0)
  await closeDialog()

  // When the user chooses Chinese prompts
  await choosePromptLanguage("Chinese")
  const chinese = await viewPrompt("Legal")

  // Then
  assert.match(await chinese.inputValue(), /正式的法律文书语体/)
  await capture(options, "domain-view")
  await closeDialog()
})

it("user translates a contract with the legal prompt in Chinese: Given the quality settings, When the user picks Legal and Chinese prompts and translates a page, Then the model gets the Chinese legal instruction and no system prompt", async () => {
  // Given
  await promptRow("Legal").getByRole("radio").check()
  await choosePromptLanguage("Chinese")
  await options.reload()
  await waitForText(options, "Prompt language")
  assert.equal(await promptRow("Legal").getByRole("radio").isChecked(), true)
  await promptLanguageChips().getByRole("button", { name: "Chinese", exact: true, pressed: true }).waitFor()
  await capture(options, "domain-settings")

  // When
  await article.bringToFront()
  await article.goto(pageURL)
  await waitForText(article, text)
  await article.keyboard.press("Alt+e")
  await article.locator("#clause .plainly-translated-content-wrapper", { hasText: translated }).waitFor()

  // Then
  // The page title is translated in its own request.
  const request = translationRequests().find(body => JSON.stringify(body.messages).includes(text))
  assert.deepEqual(request.messages.map(message => message.role), ["user"])
  const prompt = request.messages[0].content
  assert.ok(prompt.startsWith(`【背景信息】\n标题: ${title}\n\n请结合背景信息将以下文本翻译为法语，注意只需要输出翻译后的结果，不要额外解释。\n注意翻译的风格要严格符合【正式的法律文书语体`), prompt)
  assert.ok(prompt.endsWith(`【待翻译文本】\n${text}`), prompt)
})

it("user customizes the legal prompt: Given the read-only legal prompt, When the user customizes it, edits the copy and translates a page with it, Then the model gets the edited copy and the built-in prompt stays unchanged", async () => {
  // Given
  const builtin = await viewPrompt("Legal")
  const builtinText = await builtin.inputValue()
  const dialog = options.getByRole("dialog")

  // When
  await dialog.getByRole("button", { name: "Customize", exact: true }).click()
  const name = options.locator("#prompt-name")
  assert.equal(await name.inputValue(), "Legal (custom)")
  assert.equal(await dialog.getByText("New prompt", { exact: true }).count(), 1)
  const prompt = dialog.locator("textarea.max-h-60")
  assert.equal(await prompt.isDisabled(), false)
  assert.equal(await prompt.inputValue(), builtinText)
  // The copy keeps the language of the template, and the user can change it.
  const language = dialog.getByRole("group", { name: "Prompt language" })
  assert.equal(await language.getByRole("button", { name: "English", exact: true }).getAttribute("aria-pressed"), "true")
  assert.equal(await language.getByRole("button", { name: "English", exact: true }).isDisabled(), false)
  await name.fill("Contracts")
  await prompt.fill(builtinText.replace("formal legal language", "formal contract language"))
  await capture(options, "domain-customize")
  await dialog.getByRole("button", { name: "Save", exact: true }).click()
  await dialog.waitFor({ state: "detached" })
  await promptRow("Contracts").getByRole("radio").check()
  const saved = await options.evaluate(() => new Promise((resolve) => {
    const check = async () => {
      const { config } = await chrome.storage.local.get("config")
      const copy = config.translate.customPromptsConfig.patterns.find(pattern => pattern.name === "Contracts")
      if (copy) {
        chrome.storage.onChanged.removeListener(check)
        resolve(copy)
      }
    }
    chrome.storage.onChanged.addListener(check)
    check()
  }))
  assert.equal(saved.promptLanguage, "en")

  // Then the built-in prompt is still read-only and unchanged
  const after = await viewPrompt("Legal")
  assert.equal(await after.isDisabled(), true)
  assert.equal(await after.inputValue(), builtinText)
  assert.equal(await options.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).count(), 0)
  await closeDialog()

  // When the user translates a page with the copy
  await article.bringToFront()
  await article.goto(pageURL)
  await waitForText(article, text)
  await article.keyboard.press("Alt+e")
  await article.locator("#clause .plainly-translated-content-wrapper", { hasText: translated }).waitFor()

  // Then
  const request = translationRequests().find(body => JSON.stringify(body.messages).includes(text))
  // Like the built-in prompt: one user message, no summary line (page context is off), and the batch rule once.
  assert.deepEqual(request.messages.map(message => message.role), ["user"])
  assert.equal(request.messages[0].content, `[Background Information]\nTitle: ${title}\n\nPlease translate the following text into French, taking the provided background information into consideration. Note that you should only output the translated result without any additional explanation.\nNote that the translation style must strictly conform to [formal contract language, with accurate legal terms, and clause numbers and defined terms kept as in the source].\nYou must retain the exact same number of delimiters in the translation. Strictly do not omit, escape, or translate these symbols, and pay close attention to their placement.\n\n[Source Text]\n${text}`)
})
