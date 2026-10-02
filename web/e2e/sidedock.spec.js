import { test, expect } from './fixtures.js'

// OpenProject #679: from 1024px a tapped sensor docks over the right of the map.
// The helpers below are the ones panelscroll.spec.js uses.
const WIDE = { width: 1440, height: 900 }

async function prepareMap(page, path = '/en/') {
  await page.goto(path)
  await page.waitForFunction(() => document.querySelector('[data-island="map"]')?.__map?.isStyleLoaded?.())
  await page.waitForTimeout(1000)
  await expect.poll(() => page.evaluate(() => document.querySelector('[data-island="map"]').__map.isMoving())).toBe(false)
  await page.evaluate(() => {
    document.querySelector('.map-shell').scrollIntoView({ block: 'start', behavior: 'instant' })
    document.querySelector('[data-island="map"]').__map.jumpTo({ center: [23.32, 42.69], zoom: 11 })
  })
}

// Client points of hex cells naming one station, clear of the map's edges and
// of any overlay, skipping sensor ids in `skip`.
const hexPoints = (page, skip) => page.evaluate((skip) => {
  const map = document.querySelector('[data-island="map"]').__map
  if (!map?.getLayer?.('airbg-hex-fill')) return []
  const box = map.getCanvas().getBoundingClientRect()
  const out = []
  for (const f of map.queryRenderedFeatures({ layers: ['airbg-hex-fill'] })) {
    const id = f.properties?.sensorId
    if (f.geometry.type !== 'Polygon' || id == null || skip.includes(Number(id))) continue
    const ring = f.geometry.coordinates[0].slice(0, -1)
    const c = [0, 1].map((i) => ring.reduce((a, p) => a + p[i], 0) / ring.length)
    const p = map.project(c)
    const y = box.top + p.y
    if (p.x < 30 || p.x > box.width - 30 || y < 80 || p.y > box.height - 30) continue
    const x = box.left + p.x
    if (document.elementFromPoint(x, y) !== map.getCanvas()) continue
    if (out.some((o) => o.id === Number(id))) continue
    out.push({ x, y, id: Number(id) })
  }
  return out
}, skip)

async function tapHex(page, skip = []) {
  let pts = []
  await expect.poll(async () => { pts = await hexPoints(page, skip); return pts.length }, { timeout: 20000 }).toBeGreaterThan(0)
  await page.mouse.click(pts[0].x, pts[0].y)
  await expect(page).toHaveURL(/#.*sensor=\d+/)
  return pts[0].id
}

const box = async (locator) => {
  const b = await locator.boundingBox()
  expect(b).not.toBeNull()
  return b
}
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function wideOpen(browser, size = WIDE) {
  const context = await browser.newContext({ viewport: size })
  const page = await context.newPage()
  await prepareMap(page)
  const id = await tapHex(page)
  return { context, page, id }
}

test('1440: a tapped sensor docks inside the right of the map without scrolling', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const context = await browser.newContext({ viewport: WIDE })
  const page = await context.newPage()
  await prepareMap(page)
  const before = await page.evaluate(() => window.scrollY)
  await tapHex(page)
  const dock = page.locator('.map-dock')
  await expect(dock).toBeVisible()
  const d = await box(dock)
  const m = await box(page.locator('#map'))
  expect(d.x).toBeGreaterThanOrEqual(m.x)
  expect(d.y).toBeGreaterThanOrEqual(m.y)
  expect(d.y + d.height).toBeLessThanOrEqual(m.y + m.height)
  expect(m.x + m.width - (d.x + d.width), 'dock is not at the map right edge').toBeLessThanOrEqual(16)
  expect(await page.evaluate(() => window.scrollY)).toBe(before)
  await expect(dock.locator('h2')).toContainText(/\S/)
  await expect(dock.locator('.gauges .gauge').first()).toBeVisible()
  await context.close()
})

test('1440: a second hexagon swaps the dock in place', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page, id } = await wideOpen(browser)
  const first = await page.locator('.map-dock h2').textContent()
  await tapHex(page, [id])
  await expect(page.locator('.map-dock h2')).not.toHaveText(first)
  await expect(page.locator('.map-dock')).toHaveCount(1)
  await context.close()
})

test('1440: the close button and Escape close the dock and clear the hash', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page, id } = await wideOpen(browser)
  await expect(page.locator('.map-dock')).toBeVisible()
  await page.locator('.map-dock').getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.map-dock')).toBeHidden()
  expect(page.url()).not.toContain('sensor=')

  await tapHex(page, [id])
  await expect(page.locator('.map-dock')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('.map-dock')).toBeHidden()
  expect(page.url()).not.toContain('sensor=')
  await context.close()
})

test('1440: zoom and locate controls clear the dock', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  const d = await box(page.locator('.map-dock'))
  for (const sel of ['.map-zoom', '.map-locate']) {
    const c = page.locator(sel)
    if (await c.count() === 0 || !(await c.first().isVisible())) continue
    expect(overlaps(d, await box(c.first())), `${sel} sits under the dock`).toBe(false)
  }
  await context.close()
})

test('1440: a deep-linked sensor opens docked on load', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const context = await browser.newContext({ viewport: WIDE })
  const page = await context.newPage()
  await page.goto('/en/#sensor=101')
  await expect(page.locator('.map-dock .gauges')).toBeVisible({ timeout: 15000 })
  await context.close()
})

test('1440 to 900: the card returns under the map with one set of gauges', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  await expect(page.locator('.map-dock')).toBeVisible()
  await page.setViewportSize({ width: 900, height: 600 })
  await expect(page.locator('.map-dock')).toHaveCount(0)
  await expect(page.locator('[data-island="panel"] .sensor-panel .gauges')).toHaveCount(1)
  await expect(page.locator('.gauges')).toHaveCount(1)
  await page.setViewportSize(WIDE)
  await expect(page.locator('.map-dock .gauges')).toHaveCount(1)
  await expect(page.locator('.gauges')).toHaveCount(1)
  await context.close()
})

test('900x600: a tapped sensor scrolls its card into view', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser, { width: 900, height: 600 })
  await expect(page.locator('.map-dock')).toHaveCount(0)
  const h2 = page.locator('[data-island="panel"] .sensor-panel h2')
  await expect(h2).toBeVisible()
  await expect.poll(async () => {
    const b = await h2.boundingBox()
    return b !== null && b.y >= 0 && b.y + b.height <= 600
  }).toBe(true)
  await context.close()
})

test('1440: fullscreen keeps the sensor sheet and no dock', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  await expect(page.locator('.map-dock')).toBeVisible()
  await page.locator('.map__full').click()
  await expect(page.locator('.map-sensor-sheet')).toBeVisible()
  await expect(page.locator('.map-dock')).toHaveCount(0)
  await expect(page.locator('.gauges')).toHaveCount(1)
  await page.locator('.map__full').click()
  await expect(page.locator('.map-sensor-sheet')).toHaveCount(0)
  await expect(page.locator('.map-dock .gauges')).toHaveCount(1)
  await expect(page.locator('.gauges')).toHaveCount(1)
  await context.close()
})
