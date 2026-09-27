import { test, expect } from './fixtures.js'

// OpenProject #609: production CLS on /area/varna measured 0.185, sourced to
// the switcher and sensorbar islands hydrating from zero height and pushing
// the fixed-height map down (see app.css's min-block-size reservations on
// [data-island="switcher"] / [data-island="sensorbar"]). Sofia is this
// suite's equivalent covered area; 393x873 matches the Lighthouse mobile
// viewport the baseline was measured at.
test('CLS on /area/sofia stays under 0.1 at the Lighthouse mobile viewport', async ({ ctx }) => {
  const page = await ctx.newPage()
  // Registered before navigation so entries from the very first paint are
  // captured, not just ones after the script tag most viewport waits for.
  await page.addInitScript(() => {
    window.__cls = 0
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!entry.hadRecentInput) window.__cls += entry.value
      }
    }).observe({ type: 'layout-shift', buffered: true })
  })
  await page.setViewportSize({ width: 393, height: 873 })
  await page.goto('/area/sofia')
  // Past hydration: islands mount asynchronously and this is what the shift
  // reservation is meant to have already priced in by then.
  await page.waitForTimeout(3000)
  const cls = await page.evaluate(() => window.__cls)
  expect(cls).toBeLessThan(0.1)
  await page.close()
})
