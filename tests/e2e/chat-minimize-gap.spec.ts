import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, type Locator, type Page, request, test } from 'playwright/test'
import { E2E_BASE_URL, E2E_TOKEN, storeKey, wsRequest } from './helpers'
import { openWorkspace } from './ui'

/**
 * Minimizing and restoring the window must keep a chat reader's place in the
 * history. A viewport that collapsed to zero height used to swap the windowed
 * list for the whole transcript: the restore clamped scrollTop to the end and
 * cached row heights measured at the narrow mid-restore widths.
 */

const DESKTOP = { width: 1440, height: 900 }
const TURNS = 10
const prompt = (n: number): string => `[REPLY:3000] turn ${n}.`
/** The virtualizer's paddingStart + paddingEnd in ChatMessageList. */
const LIST_PADDING_PX = 48

test.use({ viewport: DESKTOP })
test.setTimeout(90_000)

type Step = { width: number; height: number; frames: number }

const MINIMIZES: Record<string, Step[]> = {
  'collapse to 1x1': [{ width: 1, height: 1, frames: 10 }],
  'collapse, then restore through narrow sizes': [
    { width: 1, height: 1, frames: 10 },
    { width: 160, height: 120, frames: 3 },
    { width: 700, height: 420, frames: 3 }
  ]
}

/** The desktop app keeps its desktop shell at any window size; so does this page. */
async function pinDesktopShell(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const original = window.matchMedia.bind(window)
    window.matchMedia = (query: string) => {
      const result = original(query)
      if (!/max-width: 767px|max-height: 499px/.test(query)) return result
      return new Proxy(result, {
        get(target, prop) {
          if (prop === 'matches') return false
          const value = Reflect.get(target, prop)
          return typeof value === 'function' ? value.bind(target) : value
        }
      })
    }
  })
}

async function registerProject(): Promise<string> {
  const root = process.env.E2E_WORKSPACE_ROOT
  if (!root) throw new Error('E2E_WORKSPACE_ROOT not set (global-setup)')
  const name = `proj-gap-${randomUUID().slice(0, 8)}`
  const id = `e2e-${name}`
  const path = join(root, name)
  await mkdir(path, { recursive: true })
  const api = await request.newContext()
  try {
    const res = await api.post(`${E2E_BASE_URL}/projects`, {
      headers: { Authorization: `Bearer ${E2E_TOKEN}`, 'content-type': 'application/json' },
      data: { id, name, path, color: 'blue' }
    })
    if (!res.ok()) throw new Error(`project registration failed: ${res.status()}`)
  } finally {
    await api.dispose()
  }
  return id
}

/** Open a fresh project and send TURNS prompts that each get a long reply. */
async function buildLongChat(page: Page): Promise<void> {
  await wsRequest(E2E_BASE_URL, 'store_write', {
    key: storeKey('active-project'),
    value: { _version: 1, data: await registerProject() }
  })
  await openWorkspace(page)
  const lastRow = page.locator('[data-index]').last()
  const launcher = page.getByRole('textbox', { name: 'Agent prompt' })
  const start = page.getByRole('button', { name: 'Start agent chat' })
  await expect(async () => {
    await launcher.focus()
    await page.keyboard.press('ControlOrMeta+A')
    await page.keyboard.insertText(prompt(1))
    await expect(start).toBeEnabled({ timeout: 2_500 })
  }).toPass({ timeout: 40_000 })
  await start.click()
  await expect(lastRow).toContainText(`Replied to: ${prompt(1)}`)
  const editor = page.locator('[data-chat-composer="true"]').getByRole('textbox')
  for (let n = 2; n <= TURNS; n++) {
    await editor.click()
    await page.keyboard.insertText(prompt(n))
    await page.keyboard.press('Enter')
    await expect(lastRow).toContainText(`Replied to: ${prompt(n)}`)
  }
}

const nextFrames = (page: Page, n: number): Promise<void> =>
  page.evaluate(
    (count) =>
      new Promise<void>((resolve) => {
        let left = count
        const step = (): void => {
          if (--left <= 0) resolve()
          else requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
      }),
    n
  )

/** Scroll top to bottom so every row mounts; returns the list height its real rows add up to. */
async function realListHeight(page: Page, viewport: Locator): Promise<number> {
  await viewport.evaluate((el) => {
    el.scrollTop = 0
  })
  const heights = new Map<number, number>()
  for (let atEnd = false; !atEnd; ) {
    await nextFrames(page, 3)
    const rows = await page
      .locator('[data-index]')
      .evaluateAll((els) =>
        els.map((el) => [Number(el.getAttribute('data-index')), (el as HTMLElement).offsetHeight])
      )
    for (const [index, height] of rows) heights.set(index, height)
    atEnd = await viewport.evaluate((el) => {
      const before = el.scrollTop
      el.scrollTop = before + el.clientHeight
      return el.scrollTop === before
    })
  }
  return [...heights.values()].reduce((sum, h) => sum + h, LIST_PADDING_PX)
}

test.beforeAll(async ({ browser }) => {
  test.setTimeout(150_000)
  const page = await browser.newPage()
  await buildLongChat(page)
  await page.close()
})

for (const [name, steps] of Object.entries(MINIMIZES)) {
  test(`${name} keeps the chat reading position`, async ({ page }) => {
    await pinDesktopShell(page)
    await openWorkspace(page)
    await expect(page.locator('[data-index]').last()).toContainText(`Replied to: ${prompt(TURNS)}`)
    const visibleChat = page.locator('[data-chat-tab-state="visible"]')
    const viewport = visibleChat.locator('[data-slot="message-scroller-viewport"]')
    const content = visibleChat.locator('[data-slot="message-scroller-content"]')
    const realHeight = await realListHeight(page, viewport)
    await viewport.evaluate((el) => {
      el.scrollTop = Math.round(el.scrollHeight * 0.45)
    })
    await nextFrames(page, 10)
    const before = await viewport.evaluate((el) => el.scrollTop)

    for (const step of steps) {
      await page.setViewportSize({ width: step.width, height: step.height })
      await nextFrames(page, step.frames)
    }
    await page.setViewportSize(DESKTOP)
    await nextFrames(page, 10)

    const after = await viewport.evaluate((el) => el.scrollTop)
    expect.soft(after, 'reading position kept').toBeGreaterThanOrEqual(before - 2)
    expect.soft(after, 'reading position kept').toBeLessThanOrEqual(before + 2)
    expect
      .soft(
        await content.evaluate((el) => (el as HTMLElement).offsetHeight),
        "list height matches the rows' real heights"
      )
      .toBe(realHeight)
  })
}
