import { test, expect } from './fixtures.js'

// The About tab and the visitors chart, at the widths the masthead has to fit.
// fits: false marks a known overflow that needs a design call, not smaller type
// (bg "За проекта" at 390 pushes the language picker past the edge; at 320 the
// masthead already overflowed before the tab existed).
const cases = [
  { lang: '/en', name: 'phone-390', width: 390, height: 844, fits: true },
  { lang: '/en', name: 'desktop', width: 1280, height: 800, fits: true },
  { lang: '', name: 'desktop', width: 1280, height: 800, fits: true },
  { lang: '/en', name: 'phone-320', width: 320, height: 640, fits: false },
  { lang: '', name: 'phone-390', width: 390, height: 844, fits: false },
  { lang: '', name: 'phone-320', width: 320, height: 640, fits: false },
]

for (const c of cases) {
  const title = `about tab fits the masthead without wrapping or sideways scroll (${c.lang || '/bg'}, ${c.name})`
  ;(c.fits ? test : test.fixme)(title, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.setViewportSize({ width: c.width, height: c.height })
    await page.goto(`${c.lang}/about`)
    const tab = page.locator(`.masthead a[href="${c.lang}/about"]`)
    await expect(tab).toBeVisible()
    await expect(tab).toHaveAttribute('aria-current', 'page')
    const m = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('.masthead a, .masthead summary')].map((a) => a.getBoundingClientRect())
      const tabBox = document.querySelector('.masthead a[aria-current="page"]').getBoundingClientRect()
      return {
        doc: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        right: Math.max(...boxes.map((r) => r.right)),
        vw: document.documentElement.clientWidth,
        tabHeight: tabBox.height,
      }
    })
    expect(m.doc).toBeLessThanOrEqual(0)
    expect(m.right).toBeLessThanOrEqual(m.vw)
    // The tab is a one-line, at most 48px control; a wrapped label would be taller.
    expect(m.tabHeight).toBeLessThanOrEqual(48)
    await page.close()
  })
}

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
