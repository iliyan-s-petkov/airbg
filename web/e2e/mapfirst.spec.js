import { test, expect } from './fixtures.js'

// Map-first home: no hero or toolbar above the map; its controls ride on it.
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 393, height: 873 }

const mastheadBottom = (page) => page.locator('.masthead').evaluate((el) => el.getBoundingClientRect().bottom)

test('desktop 1440x900: the map starts under the masthead and fills the viewport', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.setViewportSize(DESKTOP)
  await page.goto('/en/')
  const map = await page.locator('#map').boundingBox()
  expect(Math.abs(map.y - await mastheadBottom(page))).toBeLessThanOrEqual(8)
  expect(Math.abs(map.y + map.height - DESKTOP.height)).toBeLessThanOrEqual(2)
  await page.close()
})

for (const [name, vp] of [['1440', DESKTOP], ['390', { width: 390, height: 844 }]]) {
  test(`${name}px: brand reads "kanarche" and keeps "Kanarche" as its accessible name`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize(vp)
    await page.goto('/en/')
    const brand = page.locator('header.masthead .masthead__brand')
    expect((await brand.innerText()).trim()).toBe('kanarche')
    await expect(brand).toHaveAttribute('aria-label', 'Kanarche')
    await page.close()
  })
}

// A masthead wider than the screen makes a phone zoom the whole page out.
for (const path of ['/', '/en/']) {
  test(`360px ${path}: the masthead fits the screen`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: 360, height: 740 })
    await page.goto(path)
    await expect(page.locator('[data-island="theme"]')).toBeVisible()
    const widths = await page.evaluate(() => [document.querySelector('header.masthead').scrollWidth, document.documentElement.scrollWidth])
    expect(widths).toEqual([360, 360])
    await page.close()
  })
}

for (const [name, vp] of [['desktop', DESKTOP], ['phone', PHONE]]) {
  test(`${name}: no .toolbar above the map, one hidden h1, no visible hero`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize(vp)
    await page.goto('/en/')
    await expect(page.locator('.toolbar')).toHaveCount(0)
    await expect(page.locator('.page-head')).toHaveCount(0)
    const h1 = page.locator('h1')
    await expect(h1).toHaveCount(1)
    await expect(h1).toHaveText('Kanarche — Bulgaria air quality map: PM2.5 and PM10 now')
    const box = await h1.boundingBox()
    expect(box.width * box.height).toBeLessThanOrEqual(1)
    await page.close()
  })

  test(`${name}: metric pill is exactly the metric label, on the map top-left half`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize(vp)
    await page.goto('/en/')
    const pill = page.locator('#metric-menu')
    await expect(pill).toBeVisible()
    const metric = await page.locator('#map').getAttribute('data-metric')
    const metrics = (await page.locator('#map').getAttribute('data-metrics')).split(',').map((s) => s.trim())
    const labels = (await page.locator('#map').getAttribute('data-metric-labels')).split(',').map((s) => s.trim())
    expect((await pill.textContent()).trim()).toBe(labels[metrics.indexOf(metric)])
    expect(await pill.getAttribute('aria-label')).toContain(labels[metrics.indexOf(metric)])
    const map = await page.locator('#map').boundingBox()
    const box = await pill.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(map.x)
    expect(box.y).toBeGreaterThanOrEqual(map.y)
    expect(box.y + box.height).toBeLessThanOrEqual(map.y + 64)
    expect(box.x + box.width).toBeLessThan(map.x + map.width / 2)
    if (vp === PHONE) expect(box.height).toBeGreaterThanOrEqual(44)
    await page.close()
  })

  test(`${name}: finder is top-right on the map and clear of the other controls`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize(vp)
    await page.goto('/en/')
    const input = page.locator('[data-island="finder"] input')
    await expect(input).toBeVisible()
    const map = await page.locator('#map').boundingBox()
    const f = await input.boundingBox()
    expect(f.y).toBeGreaterThanOrEqual(map.y)
    expect(f.y + f.height).toBeLessThanOrEqual(map.y + 64)
    expect(f.x + f.width).toBeLessThanOrEqual(map.x + map.width)
    if (vp === PHONE) expect(f.height).toBeGreaterThanOrEqual(44)
    const hit = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
    for (const sel of ['.map__full', '.map__layers', '#metric-menu']) {
      const o = await page.locator(sel).first().boundingBox()
      expect(hit(f, o), sel).toBe(false)
    }
    await page.close()
  })
}

test('the manual refresh sits in the freshness line beside the timer and still reloads', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.setViewportSize(DESKTOP)
  await page.goto('/en/')
  const line = page.locator('.map-freshness')
  const refresh = line.locator('.data-refresh__btn--icon')
  await expect(refresh).toBeVisible()
  await expect(line.locator('.data-refresh__auto')).toBeVisible()
  const reload = page.waitForResponse((r) => r.url().includes('/api/v1/') && r.request().method() === 'GET')
  await refresh.click()
  await reload
  await page.close()
})

test('desktop: a scroll cue sits inside the map bottom edge and reaches the content below', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.setViewportSize(DESKTOP)
  await page.goto('/en/')
  const cue = page.locator('a.scroll-cue')
  await expect(cue).toBeVisible()
  const map = await page.locator('#map').boundingBox()
  const box = await cue.boundingBox()
  expect(box.y).toBeGreaterThanOrEqual(map.y)
  expect(box.y + box.height).toBeLessThanOrEqual(map.y + map.height + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP.height)
  await cue.click()
  await expect.poll(() => page.evaluate(() => Math.abs(document.getElementById('below-map').getBoundingClientRect().top) <= 80 || scrollY > 0)).toBe(true)
  await page.close()
})
