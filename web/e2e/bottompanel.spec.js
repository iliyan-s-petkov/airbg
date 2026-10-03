import { test, expect } from './fixtures.js'

// OpenProject #684: from 1024px a tapped sensor opens a panel along the bottom of the map.
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
    out.push({ x, y, id: Number(id), c })
  }
  return out
}, skip)

// low: the cell nearest the map's bottom edge, the one a bottom panel would cover.
async function tapHex(page, skip = [], { low = false } = {}) {
  let pts = []
  await expect.poll(async () => { pts = await hexPoints(page, skip); return pts.length }, { timeout: 20000 }).toBeGreaterThan(0)
  const pick = low ? pts.reduce((a, b) => (b.y > a.y ? b : a)) : pts[0]
  await page.mouse.click(pick.x, pick.y)
  await expect(page).toHaveURL(/#.*sensor=\d+/)
  lastCell = pick.c
  return pick.id
}
let lastCell = null

const box = async (locator) => {
  const b = await locator.boundingBox()
  expect(b).not.toBeNull()
  return b
}
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function wideOpen(browser, size = WIDE, opts = {}) {
  const context = await browser.newContext({ viewport: size })
  const page = await context.newPage()
  await prepareMap(page)
  const id = await tapHex(page, [], opts)
  return { context, page, id }
}

const PANEL = '.map-dock'

test('1440: a tapped sensor opens a panel along the bottom of the map', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const context = await browser.newContext({ viewport: WIDE })
  const page = await context.newPage()
  await prepareMap(page)
  const before = await page.evaluate(() => window.scrollY)
  await tapHex(page)
  const panel = page.locator(PANEL)
  await expect(panel).toBeVisible()
  const d = await box(panel)
  const m = await box(page.locator('#map'))
  expect(d.x).toBeGreaterThanOrEqual(m.x)
  expect(d.x + d.width).toBeLessThanOrEqual(m.x + m.width)
  expect(d.y + d.height).toBeLessThanOrEqual(m.y + m.height)
  expect(m.y + m.height - (d.y + d.height), 'panel is not at the map bottom').toBeLessThanOrEqual(16)
  expect(d.width / m.width, 'panel is narrower than 80% of the map').toBeGreaterThanOrEqual(0.8)
  expect(d.height / m.height, 'panel is taller than 45% of the map').toBeLessThanOrEqual(0.46)
  expect(await page.evaluate(() => window.scrollY)).toBe(before)
  await expect(panel.locator('h2')).toContainText(/\S/)
  await context.close()
})

test('1440: the gauges share one row', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  const gauges = page.locator(`${PANEL} .gauges .gauge`)
  await expect(gauges.first()).toBeVisible()
  expect(await gauges.count()).toBeGreaterThan(1)
  const tops = await gauges.evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)))
  expect(new Set(tops).size, `gauge tops differ: ${tops}`).toBe(1)
  await context.close()
})

test('1440: the chart sits in the panel and follows the selected gauge', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  const chart = page.locator(`${PANEL} .panel-chart__dock .chart-frame`)
  await expect(chart).toBeVisible()
  expect((await box(chart)).height).toBeGreaterThan(40)
  const plot = page.locator(`${PANEL} .panel-chart__dock`)
  const was = await plot.getAttribute('data-metric')
  await page.locator(`${PANEL} .gauges .gauge[aria-pressed="false"]`).first().click()
  await expect(plot).not.toHaveAttribute('data-metric', was)
  const now = await plot.getAttribute('data-metric')
  const pressed = await page.locator(`${PANEL} .gauges .gauge[aria-pressed="true"]`).count()
  expect(pressed).toBe(1)
  expect(now).toBeTruthy()
  // The only chart controls in the panel are the period chips.
  await expect(page.locator(`${PANEL} select, ${PANEL} .chart-field, ${PANEL} .colmenu`)).toHaveCount(0)
  await context.close()
})

test('1440: a period chip changes the period', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  const plot = page.locator(`${PANEL} .panel-chart__dock`)
  const chips = page.locator(`${PANEL} .period-seg button:visible`)
  await expect(chips).toHaveCount(3)
  await expect(chips.nth(0)).toHaveAttribute('aria-pressed', 'true')
  await chips.nth(1).click()
  await expect(chips.nth(1)).toHaveAttribute('aria-pressed', 'true')
  await expect(plot).toHaveAttribute('data-period', '7d')
  await chips.nth(2).click()
  await expect(plot).toHaveAttribute('data-period', '30d')
  await context.close()
})

test('1440: fold hides the chart, shrinks the panel and survives a reload', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page, id } = await wideOpen(browser)
  const panel = page.locator(PANEL)
  const open = await box(panel)
  await panel.getByRole('button', { name: 'Fold' }).click()
  await expect(page.locator(`${PANEL} .chart-frame:visible`)).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Expand' })).toBeVisible()
  await expect(panel.locator('.gauges .gauge').first()).toBeVisible()
  expect((await box(panel)).height).toBeLessThan(open.height * 0.6)
  expect(await page.evaluate(() => localStorage.getItem('kanarche:panel-folded'))).toBe('true')

  await page.goto(`/en/#sensor=${id}`)
  await page.reload()
  await expect(page.locator(`${PANEL} .gauges`)).toBeVisible({ timeout: 20000 })
  await expect(page.locator(PANEL).getByRole('button', { name: 'Expand' })).toBeVisible()
  await expect(page.locator(`${PANEL} .chart-frame:visible`)).toHaveCount(0)

  await page.locator(PANEL).getByRole('button', { name: 'Expand' }).click()
  await expect(page.locator(`${PANEL} .chart-frame`)).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('kanarche:panel-folded'))).toBe('false')
  await context.close()
})

test('1440: the history button scrolls the section below the map into view', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  const section = page.locator('[data-island="panel"] .sensor-panel')
  const before = await page.evaluate(() => window.scrollY)
  await page.locator(PANEL).getByRole('button', { name: /Full history/ }).click()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(before)
  await expect.poll(async () => {
    const b = await section.boundingBox()
    return b !== null && b.y < 600 && b.y + b.height > 0
  }).toBe(true)
  await context.close()
})

test('1440: the legend and locate button sit above the panel, open or folded', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  const check = async (when) => {
    const p = await box(page.locator(PANEL))
    for (const sel of ['.map-locate', '.scale--onmap', '.map-freshness', '.maplibregl-ctrl-attrib']) {
      const c = page.locator(sel).first()
      if (await c.count() === 0 || !(await c.isVisible())) continue
      expect(overlaps(p, await box(c)), `${sel} sits under the panel (${when})`).toBe(false)
    }
  }
  await check('open')
  await page.locator(PANEL).getByRole('button', { name: 'Fold' }).click()
  await expect(page.locator(PANEL).getByRole('button', { name: 'Expand' })).toBeVisible()
  await expect.poll(async () => (await box(page.locator('.map-locate'))).y + 16).toBeLessThan((await box(page.locator(PANEL))).y)
  await check('folded')
  await context.close()
})

test('1440: the selected hexagon stays above the panel and padding resets on close', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser, WIDE, { low: true })
  const cell = lastCell
  const probe = () => page.evaluate((c) => {
    const map = document.querySelector('[data-island="map"]').__map
    return { y: map.project(c).y, pad: map.getPadding().bottom, moving: map.isMoving() }
  }, cell)
  const panelTop = async () => (await box(page.locator(PANEL))).y - (await box(page.locator('#map'))).y
  await expect.poll(async () => { const s = await probe(); return !s.moving && s.y < (await panelTop()) }).toBe(true)
  expect((await probe()).pad).toBeGreaterThan(100)
  await page.locator(PANEL).getByRole('button', { name: 'Fold' }).click()
  await expect.poll(async () => (await probe()).pad).toBeLessThan((await box(page.locator(PANEL))).height + 40)
  await page.locator(PANEL).getByRole('button', { name: 'Expand' }).click()
  await expect.poll(async () => (await probe()).pad).toBeGreaterThan(100)
  await page.locator(PANEL).getByRole('button', { name: 'Close' }).click()
  await expect(page.locator(PANEL)).toHaveCount(0)
  await expect.poll(async () => (await probe()).pad).toBe(0)
  await context.close()
})

test('1440: a second hexagon swaps the panel in place', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page, id } = await wideOpen(browser)
  const first = await page.locator(`${PANEL} h2`).textContent()
  await tapHex(page, [id])
  await expect(page.locator(`${PANEL} h2`)).not.toHaveText(first)
  await expect(page.locator(PANEL)).toHaveCount(1)
  await expect(page.locator(`${PANEL} .panel-chart__dock`)).toHaveCount(1)
  await context.close()
})

test('1440: the close button and Escape close the panel, clear the hash and reset padding', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page, id } = await wideOpen(browser)
  const pad = () => page.evaluate(() => document.querySelector('[data-island="map"]').__map.getPadding().bottom)
  await expect(page.locator(PANEL)).toBeVisible()
  await expect.poll(pad).toBeGreaterThan(100)
  await page.locator(PANEL).getByRole('button', { name: 'Close' }).click()
  await expect(page.locator(PANEL)).toBeHidden()
  expect(page.url()).not.toContain('sensor=')
  await expect.poll(pad).toBe(0)

  await tapHex(page, [id])
  await expect(page.locator(PANEL)).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator(PANEL)).toBeHidden()
  expect(page.url()).not.toContain('sensor=')
  await expect.poll(pad).toBe(0)
  await context.close()
})

test('1440: a deep-linked sensor opens the panel on load', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const context = await browser.newContext({ viewport: WIDE })
  const page = await context.newPage()
  await page.goto('/en/#sensor=101')
  await expect(page.locator(`${PANEL} .gauges`)).toBeVisible({ timeout: 15000 })
  await context.close()
})

test('1440 to 900: the card returns under the map with one set of gauges and one chart', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  await expect(page.locator(PANEL)).toBeVisible()
  await expect(page.locator(`${PANEL} .chart-frame`)).toHaveCount(1)
  await page.setViewportSize({ width: 900, height: 600 })
  await expect(page.locator(PANEL)).toHaveCount(0)
  await expect(page.locator('[data-island="panel"] .sensor-panel .gauges')).toHaveCount(1)
  await expect(page.locator('.gauges')).toHaveCount(1)
  await expect(page.locator('.chart-frame')).toHaveCount(1)
  await expect(page.locator('[data-island="panel"] .chart-frame')).toHaveCount(1)
  expect(await page.evaluate(() => document.querySelector('[data-island="map"]').__map.getPadding().bottom)).toBe(0)
  await page.setViewportSize(WIDE)
  await expect(page.locator(`${PANEL} .gauges .gauge`).first()).toBeVisible()
  await expect(page.locator('.gauges')).toHaveCount(1)
  await context.close()
})

test('900x600: a tapped sensor scrolls its card into view', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser, { width: 900, height: 600 })
  await expect(page.locator(PANEL)).toHaveCount(0)
  const h2 = page.locator('[data-island="panel"] .sensor-panel h2')
  await expect(h2).toBeVisible()
  await expect.poll(async () => {
    const b = await h2.boundingBox()
    return b !== null && b.y >= 0 && b.y + b.height <= 600
  }).toBe(true)
  await context.close()
})

test('1440: fullscreen keeps the sensor sheet and no panel', async ({ browser }, testInfo) => {
  testInfo.setTimeout(60000)
  const { context, page } = await wideOpen(browser)
  await expect(page.locator(PANEL)).toBeVisible()
  await page.locator('.map__full').click()
  await expect(page.locator('.map-sensor-sheet')).toBeVisible()
  await expect(page.locator(PANEL)).toHaveCount(0)
  await expect(page.locator('.gauges')).toHaveCount(1)
  await expect(page.locator('.chart-frame')).toHaveCount(1)
  await page.locator('.map__full').click()
  await expect(page.locator('.map-sensor-sheet')).toHaveCount(0)
  await expect(page.locator(`${PANEL} .gauges`)).toHaveCount(1)
  await expect(page.locator('.gauges')).toHaveCount(1)
  await context.close()
})
