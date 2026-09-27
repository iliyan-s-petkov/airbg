import { test, expect } from './fixtures.js'

test('the area page renders server-side with JavaScript disabled', async ({ browser }) => {
  // The one context of its own in the suite: JavaScript has to be off before
  // the context exists, and the whole point of server-rendered pages is that
  // this passes with no bundle — so it costs no JS chunks either.
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()
  await page.goto('/area/sofia')
  await expect(page.locator('h1')).toContainText('Sofia')
  await context.close()
})

// #609: the LCP element (p.legend__tier) is in the HTML, with the text the island settles on.
test('the legend tier caption is server-rendered and matches the hydrated map', async ({ browser, ctx }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const noJs = await context.newPage()
  await noJs.goto('/en/area/sofia')
  await expect(noJs.locator('p.legend__tier')).toHaveText('Each cell is the median of the ground beneath it')
  await context.close()

  const page = await ctx.newPage()
  await page.goto('/en/area/sofia')
  await page.waitForFunction(() => {
    const map = document.querySelector('[data-island="map"]')?.__map
    return map?.loaded() && !map.isMoving()
  }, null, { timeout: 20000 })
  await expect(page.locator('p.legend__tier')).toHaveText('Each cell is the median of the ground beneath it')
  await page.close()
})

// EN route, because the button names the metric in the page's own language.
test('the metric switcher is mounted and reflects the default metric', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.goto('/en/area/sofia')
  await expect(page.getByRole('button', { name: 'Metric: PM2.5' }).and(page.locator('#metric-menu'))).toBeVisible()
  await page.close()
})
