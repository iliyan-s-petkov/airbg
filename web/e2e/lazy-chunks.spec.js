import { test, expect } from './fixtures.js'

// #617: the wind overlay and the timelapse player load on first use, not with the map.
test('wind and timelapse chunks load only when opened', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  const page = await context.newPage()
  const chunks = []
  page.on('request', (r) => {
    const m = r.url().match(/\/assets\/(mapwind|timelapse-island)-[^/]+\.js/)
    if (m) chunks.push(m[1])
  })

  await page.goto('/en')
  await page.waitForFunction(() => {
    const map = document.querySelector('[data-island="map"]')?.__map
    return map?.loaded() && !map.isMoving()
  }, null, { timeout: 20000 })
  expect(chunks, 'a lazy chunk was requested on initial load').toEqual([])

  await page.locator('.map__layers .colmenu__btn').click()
  await page.locator('[data-layer-key="view:wind"]').check()
  await expect.poll(() => chunks).toContain('mapwind')
  expect(chunks).not.toContain('timelapse-island')

  await page.locator('.map-play__btn').first().click()
  await expect.poll(() => chunks).toContain('timelapse-island')
  await context.close()
})
