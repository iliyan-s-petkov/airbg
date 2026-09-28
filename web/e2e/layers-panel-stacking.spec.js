import { test, expect } from './fixtures.js'

// Open layers panel must sit above the time pill; every option hit-testable.
// 390x700, not 844: headless 100svh ignores the phone toolbar and hides the overlap.
const VIEWPORTS = [
  { name: 'phone 390x700', viewport: { width: 390, height: 700 }, isMobile: true, hasTouch: true },
  { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 } },
]

const withTheme = (page, theme) =>
  page.addInitScript((v) => localStorage.setItem('airbg:theme', v), theme)

const openLayers = async (page) => {
  await expect(page.locator('.map__layers .colmenu__btn')).toBeVisible()
  await page.locator('.map__layers .colmenu__btn').click()
  await expect(page.locator('.map__layers .colmenu__panel')).toBeVisible()
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    test('every option in the open layers panel is on top and hit-testable', async ({ browser }) => {
      const { name, ...opts } = vp
      const context = await browser.newContext(opts)
      const page = await context.newPage()
      await withTheme(page, 'dark')
      await page.goto('/')
      await openLayers(page)

      const options = page.locator('.map__layers .colmenu__panel .colmenu__opt')
      const count = await options.count()
      expect(count, 'no options rendered in the layers panel').toBeGreaterThan(0)

      // Sample three points per row: the pill overlaps only part of the width.
      for (let i = 0; i < count; i++) {
        const opt = options.nth(i)
        const box = await opt.boundingBox()
        expect(box, `option ${i} has no box`).not.toBeNull()
        const cy = box.y + box.height / 2
        for (const frac of [0.1, 0.5, 0.9]) {
          const x = box.x + box.width * frac
          const hit = await page.evaluate(({ x, y }) => {
            const el = document.elementFromPoint(x, y)
            const panel = document.querySelector('.map__layers .colmenu__panel')
            return { insidePanel: !!el && !!panel && panel.contains(el), tag: el?.className || el?.tagName }
          }, { x, y: cy })
          expect(hit.insidePanel, `option ${i} at (${x},${cy}) is covered by ${hit.tag}`).toBe(true)
        }
      }

      await options.last().locator('input').click({ trial: true })

      await context.close()
    })
  })
}
