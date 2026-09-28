import { test, expect } from './fixtures.js'

// Bug found on a real phone: `/` (bg), dark theme, portrait ~390px wide. With
// the layers menu open, the bottom-left time-window pill (.map-window, inside
// .map-freshness) painted OVER the open .map__layers .colmenu__panel, hiding
// and swallowing taps on the last option. Root cause: .map__layers is
// `position: absolute; z-index: 3` (kit), which makes it a stacking context of
// its own — the panel's z-index:20 only outranks its own siblings INSIDE that
// context. Against .map-freshness, a same-tier (z-index:3) sibling context,
// the tie is broken by DOM order, and the pill (later in the DOM) wins.
//
// This asserts every option in the open panel is actually hit-testable —
// document.elementFromPoint at its centre must land inside the panel, not on
// an overlay above it — and that the last option can be clicked.

// Playwright's viewport has no dynamic toolbar: 100svh always resolves to the
// full 844, so .map--hero renders taller here than on a real phone with
// Safari's toolbar visible (svh is the SMALLEST viewport, toolbar shown).
// Measured: at a bare 390x844 the layers panel's content-driven bottom
// (~577px, fixed by row count) sits ~110px above the freshness/time-pill
// cluster, no overlap. Shrinking to 390x700 reproduces the toolbar-visible
// case and lands the bug: the pill's box brackets the last option's centre.
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

      // The pill is narrower than the panel (it hugs the same left corner,
      // not the panel's own width — the panel is sized to its widest option's
      // TEXT, which runs well past the pill's right edge), so a check at only
      // the row's own centre can miss a real, partial-width overlap. Sample
      // three points across each row — near the checkbox (left), the row's
      // centre, and near its right edge — and every one must land in the panel.
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

      // The last option's own checkbox — the actual tap target, left-aligned
      // in the row, right where the pill sits — must also be genuinely
      // clickable, not just visible.
      await options.last().locator('input').click({ trial: true })

      await context.close()
    })
  })
}
