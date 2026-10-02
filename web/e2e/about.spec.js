import { test, expect } from './fixtures.js'

// Wide screens carry the About tab in the masthead. At 480px and below it is
// hidden (the masthead has no room) and the footer link is the way in.
for (const lang of ['/en', '']) {
  const label = lang || '/bg'

  test(`about tab is in the masthead at 1280 (${label})`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(`${lang}/about`)
    const tab = page.locator(`.masthead__link--about[href="${lang}/about"]`)
    await expect(tab).toBeVisible()
    await expect(tab).toHaveAttribute('aria-current', 'page')
    const m = await page.evaluate(() => ({
      over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      tabHeight: document.querySelector('.masthead a[aria-current="page"]').getBoundingClientRect().height,
    }))
    expect(m.over).toBeLessThanOrEqual(0)
    // One line: a wrapped label would be taller than the 48px control.
    expect(m.tabHeight).toBeLessThanOrEqual(48)
    await page.close()
  })

  test(`at 390 the tab is hidden, the footer link works and nothing scrolls sideways (${label})`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto(`${lang}/areas`)
    await expect(page.locator(`.masthead__link--about[href="${lang}/about"]`)).toBeHidden()
    const footer = page.locator(`.footer a[href="${lang}/about"]`)
    await expect(footer).toBeVisible()
    await footer.click()
    await expect(page).toHaveURL(new RegExp(`${lang}/about$`))
    await expect(page.locator('h1')).toBeVisible()
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over).toBeLessThanOrEqual(0)
    await page.close()
  })
}

// The images are lazy; scrolling each into view is what makes them load.
for (const [w, h] of [[390, 844], [1280, 800]]) {
  test(`getting started screenshots load and nothing scrolls sideways at ${w}`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/en/about')
    const shots = page.locator('#start .about-shot__img--light')
    await expect(shots).toHaveCount(4)
    for (let i = 0; i < 4; i++) {
      await shots.nth(i).scrollIntoViewIfNeeded()
      await expect.poll(() => shots.nth(i).evaluate((img) => img.naturalWidth)).toBeGreaterThan(0)
    }
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over).toBeLessThanOrEqual(0)
    await page.close()
  })
}

test('the dark screenshot replaces the light one under an explicit dark theme', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en/about')
  await page.evaluate(() => { document.documentElement.dataset.theme = 'dark' })
  await expect(page.locator('#start .about-shot__img--dark').first()).toBeVisible()
  await expect(page.locator('#start .about-shot__img--light').first()).toBeHidden()
  await page.close()
})

test('the visitors chart draws from the seeded days', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en/about')
  await page.locator('#visitors').scrollIntoViewIfNeeded()
  await expect(page.locator('.visitors-chart canvas')).toBeVisible()
  await expect(page.locator('.about-stats__chart .chart-message')).toHaveCount(0)
  await page.close()
})

test('the about page has no sideways scroll at 390 and 1280', async ({ ctx }) => {
  const page = await ctx.newPage()
  for (const [width, height] of [[390, 844], [1280, 800]]) {
    await page.setViewportSize({ width, height })
    await page.goto('/en/about')
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over).toBeLessThanOrEqual(0)
  }
  await page.close()
})
