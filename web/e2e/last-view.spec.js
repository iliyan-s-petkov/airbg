import { test, expect, mapSettled, userMove } from './fixtures.js'

// OP #681: the home map reopens where the visitor left it.
const KEY = 'kanarche:map-view'

const camera = (page) => page.evaluate(() => {
  const map = document.querySelector('[data-island="map"]').__map
  const c = map.getCenter()
  return { lng: c.lng, lat: c.lat, zoom: map.getZoom() }
})

const seed = (page, value) => page.addInitScript(([k, v]) => localStorage.setItem(k, v), [KEY, value])

test('first visit opens the country overview and a pan is saved', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.goto('/en/')
  await mapSettled(page)
  const overview = await camera(page)
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull()

  await userMove(page)
  const saved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))
  expect(saved.zoom).toBeGreaterThan(overview.zoom)
  await page.close()
})

test('a reload restores the panned and zoomed view', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.goto('/en/')
  await mapSettled(page)
  await userMove(page)
  const before = await camera(page)

  await page.reload()
  await mapSettled(page)
  const cam = await camera(page)
  expect(cam.zoom).toBeCloseTo(before.zoom, 1)
  expect(cam.lng).toBeCloseTo(before.lng, 2)
  expect(cam.lat).toBeCloseTo(before.lat, 2)
  await page.close()
})

test('a #sensor= deep link wins over the saved view', async ({ ctx }) => {
  const page = await ctx.newPage()
  await seed(page, JSON.stringify({ lat: 43.2, lng: 27.9, zoom: 10 }))
  await page.goto('/en/#sensor=101')
  await mapSettled(page)
  const cam = await camera(page)
  expect(Math.abs(cam.lng - 27.9)).toBeGreaterThan(1)
  await page.close()
})

test('an area page neither reads nor writes the key', async ({ ctx }) => {
  const page = await ctx.newPage()
  await seed(page, JSON.stringify({ lat: 43.2, lng: 27.9, zoom: 10 }))
  await page.goto('/en/area/sofia')
  await mapSettled(page)
  const cam = await camera(page)
  expect(Math.abs(cam.lng - 27.9)).toBeGreaterThan(1)
  await page.evaluate(() => document.querySelector('[data-island="map"]').__map.jumpTo({ center: [24.75, 42.15], zoom: 9.5 }))
  await page.waitForTimeout(1200)
  expect(JSON.parse(await page.evaluate((k) => localStorage.getItem(k), KEY))).toEqual({ lat: 43.2, lng: 27.9, zoom: 10 })
  await page.close()
})

test('garbage in the key is ignored and the overview opens', async ({ ctx }) => {
  const clean = await ctx.newPage()
  await clean.goto('/en/')
  await mapSettled(clean)
  const overview = await camera(clean)
  await clean.close()

  for (const junk of ['{not json', JSON.stringify({ lat: 48.85, lng: 2.35, zoom: 9 }), '{"lat":1e999,"lng":0,"zoom":5}']) {
    const page = await ctx.newPage()
    await seed(page, junk)
    await page.goto('/en/')
    await mapSettled(page)
    const cam = await camera(page)
    expect(cam.zoom).toBeCloseTo(overview.zoom, 1)
    expect(cam.lng).toBeCloseTo(overview.lng, 2)
    await page.close()
  }
})

test('a geoip placement is not saved and a reload opens the same view', async ({ ctx }) => {
  const page = await ctx.newPage()
  // The harness has no geoip, so the placement is stubbed.
  await page.route('**/api/v1/locate**', (route) => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ source: 'geoip', lon: 24.75, lat: 42.15, zoom: 9, slug: null }),
  }))
  await page.goto('/en/')
  await mapSettled(page)
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(9, 1)
  const placed = await camera(page)
  await page.waitForTimeout(1200)
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull()

  await page.reload()
  await mapSettled(page)
  await expect.poll(async () => (await camera(page)).zoom).toBeCloseTo(placed.zoom, 1)
  const again = await camera(page)
  expect(again.zoom).toBeCloseTo(placed.zoom, 1)
  expect(again.lng).toBeCloseTo(placed.lng, 2)
  await page.waitForTimeout(1200)
  expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull()
  await page.close()
})
