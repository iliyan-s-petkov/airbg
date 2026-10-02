import { test, expect, mapSettled } from './fixtures.js'

// Landscape phone: the layers list must stay on screen and stay scrollable.
// Two hypotheses (plan Task 3): (a) the map frame clips the panel below what
// 46vh allows, (b) a touch swipe inside the panel is taken by the map/page
// instead of scrolling the list. Both are measured before anything is fixed.
const VIEWPORTS = [
  { width: 873, height: 393 },
  { width: 873, height: 320 },
  { width: 740, height: 360 },
  { width: 740, height: 300 },
]

const openLayers = async (page) => {
  await page.locator('.map__layers .colmenu__btn').click()
  await expect(page.locator('.map__layers .colmenu__panel')).toBeVisible()
}

// A touch swipe from near the bottom of the panel toward its top, entirely
// inside the panel's box — a reader's thumb dragging the list up.
const swipeUp = async (page, box) => {
  const x = box.x + box.width / 2
  const y1 = box.y + box.height - 10
  const y2 = box.y + 10
  // Playwright's touchscreen has no drag primitive; drive it through the CDP
  // Input domain instead, which lets us hold and move a single point.
  const cdp = await page.context().newCDPSession(page)
  const point = (px, py) => [{ x: px, y: py, radiusX: 1, radiusY: 1, force: 1 }]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(x, y1) })
  for (let i = 1; i <= 5; i++) {
    const y = y1 + ((y2 - y1) * i) / 5
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(x, y) })
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await cdp.detach().catch(() => {})
}

const measure = (page) => page.evaluate(() => {
  const panel = document.querySelector('.map__layers .colmenu__panel')
  const frame = document.querySelector('.map')
  const p = panel.getBoundingClientRect()
  const f = frame.getBoundingClientRect()
  const vv = window.visualViewport
  // Walk ancestors looking for one that clips the panel via overflow: hidden.
  let clippedBy = null
  for (let el = panel.parentElement; el; el = el.parentElement) {
    const cs = getComputedStyle(el)
    if (cs.overflow === 'hidden' || cs.overflowY === 'hidden') {
      const r = el.getBoundingClientRect()
      if (p.bottom > r.bottom + 0.5) { clippedBy = el.className || el.tagName; break }
    }
  }
  const cs = getComputedStyle(panel)
  return {
    panelTop: p.top, panelBottom: p.bottom,
    frameTop: f.top, frameBottom: f.bottom,
    visualViewportHeight: vv ? vv.height : window.innerHeight,
    visualViewportOffsetTop: vv ? vv.offsetTop : 0,
    windowInnerHeight: window.innerHeight,
    scrollTop: panel.scrollTop, scrollHeight: panel.scrollHeight, clientHeight: panel.clientHeight,
    clippedBy,
    inlineMaxBlockSize: panel.style.maxBlockSize,
    touchAction: cs.touchAction,
    overscrollBehavior: cs.overscrollBehaviorBlock || cs.overscrollBehaviorY || cs.overscrollBehavior,
  }
})

for (const path of ['/en', '/en/area/sofia']) {
  for (const vp of VIEWPORTS) {
    test(`repro ${path} ${vp.width}x${vp.height}: layers panel fits and scrolls`, async ({ browser }) => {
      const context = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true })
      const page = await context.newPage()
      await page.goto(path)
      await mapSettled(page)
      await openLayers(page)

      const before = await measure(page)
      await swipeUp(page, { x: before.panelTop, y: before.panelTop, width: 1, height: 1, ...(await page.locator('.map__layers .colmenu__panel').boundingBox()) })
      const after = await measure(page)

      // eslint-disable-next-line no-console
      console.log(JSON.stringify({ path, vp, before, after }))

      const visibleBottom = Math.min(before.frameBottom, before.visualViewportOffsetTop + before.visualViewportHeight)
      expect(before.panelBottom).toBeLessThanOrEqual(visibleBottom + 1)
      if (before.scrollHeight > before.clientHeight) {
        expect(after.scrollTop).not.toBe(before.scrollTop)
      }
      expect(before.clippedBy).toBeNull()
      // fitLayers ran (an inline cap was actually set, not just the kit's 46vh)...
      expect(before.inlineMaxBlockSize).toMatch(/^\d+(\.\d+)?px$/)
      // ...and a swipe inside the panel cannot escape to the map underneath.
      expect(before.touchAction).toBe('pan-y')
      expect(before.overscrollBehavior).toBe('contain')

      await context.close()
    })
  }

  // The bug report also mentions the page having been scrolled first — the
  // map frame can be partially above the fold when the panel opens.
  test(`repro ${path} scrolled: layers panel still fits`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 873, height: 393 }, isMobile: true, hasTouch: true })
    const page = await context.newPage()
    await page.goto(path)
    await mapSettled(page)
    await page.evaluate(() => window.scrollTo(0, 80))
    await openLayers(page)
    const m = await measure(page)
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ path, scrolled: true, m }))
    const visibleBottom = Math.min(m.frameBottom, m.visualViewportOffsetTop + m.visualViewportHeight)
    expect(m.panelBottom).toBeLessThanOrEqual(visibleBottom + 1)
    await context.close()
  })
}
