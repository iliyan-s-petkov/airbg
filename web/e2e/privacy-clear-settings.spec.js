import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures.js'

// OpenProject #585: the About page's "Clear my settings" button. Real
// browser storage, a real click — the static scan (storage-allowlist.test.js)
// and the render test (internal/web privacy_test.go) cover the code and the
// markup; this covers the button actually doing the thing.
const allowListPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../internal/web/static/storage-keys.json',
)
const allowList = JSON.parse(fs.readFileSync(allowListPath, 'utf8'))
const allowedKeys = [...(allowList.localStorage ?? []), ...(allowList.sessionStorage ?? [])]

test('clicking "clear my settings" removes the allow-listed keys and confirms in the status region', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.goto('/en/about-the-data')

  // Seed every allow-listed key, plus one this site does not use, so a bug
  // that clears everything (not just the allow-list) has something to leak.
  await page.evaluate((keys) => {
    for (const key of keys) localStorage.setItem(key, 'x')
    localStorage.setItem('some-other-site:token', 'do-not-touch')
  }, allowedKeys)

  const island = page.locator('[data-island="clearsettings"]')
  const status = island.locator('[data-role="status"]')
  await expect(status).toHaveAttribute('aria-live', 'polite')
  await expect(status).toBeEmpty()

  await island.locator('button').click()

  await expect(status).not.toBeEmpty()

  const remaining = await page.evaluate(() => Object.keys(localStorage))
  for (const key of allowedKeys) {
    expect(remaining, `${key} should have been cleared`).not.toContain(key)
  }
  expect(remaining, 'a foreign key must survive the clear').toContain('some-other-site:token')

  // ctx is one browser context shared by every spec file in this run (see
  // fixtures.js) — the foreign key planted above would otherwise leak into
  // storage-allowlist.spec.js, which asserts localStorage holds nothing but
  // allow-listed keys.
  await page.evaluate(() => localStorage.removeItem('some-other-site:token'))

  await page.close()
})
