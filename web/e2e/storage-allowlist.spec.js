import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { test, expect } from './fixtures.js'

// OpenProject #584: after exercising the map's real controls, every key the
// browser actually holds in localStorage must be in the published allow-list.
// A static source scan (web/src/__tests__/storage-allowlist.test.js) covers
// the code; this covers what a real page load, in a real browser, writes.
const allowListPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../internal/web/static/storage-keys.json',
)
const allowList = JSON.parse(fs.readFileSync(allowListPath, 'utf8'))
const allowed = new Set([...(allowList.localStorage ?? []), ...(allowList.sessionStorage ?? [])])

test('localStorage after exercising the map holds only allow-listed keys', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.goto('/en/area/sofia')

  // Toggle a layer, which writes airbg:map-layers; the page load itself may
  // have already read/written airbg:theme and airbg:legend-open.
  await page.locator('.map__layers .colmenu__btn').click()
  await page.locator('.map__layers .colmenu__panel input[type="checkbox"]').first().click()

  const keys = await page.evaluate(() => Object.keys(localStorage))
  const unexpected = keys.filter((k) => !allowed.has(k))
  expect(unexpected, `unlisted localStorage keys: ${unexpected.join(', ')}`).toEqual([])

  await page.close()
})
