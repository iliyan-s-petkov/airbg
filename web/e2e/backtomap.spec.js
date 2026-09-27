import { test, expect } from './fixtures.js'

// OpenProject #612: a small round "back to map" button, fixed bottom-right,
// that appears on phones once the map has scrolled fully out of view.
const PHONES = [
  { name: '393x873', viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true },
  { name: '873x393', viewport: { width: 873, height: 393 }, isMobile: true, hasTouch: true },
]
const DESKTOP = { name: '1440x900', viewport: { width: 1440, height: 900 } }

// Fixture pages are short (four seeded sensors); pad the foot of the page so
// scrolling to the document end can actually clear the map's bottom edge,
// same as a production page with a full sensor list would.
async function padPageFoot(page) {
  // A <style> tag trips the CSP (style-src 'self'); set the property directly.
  await page.evaluate(() => { document.querySelector('.footer').style.paddingBottom = '1200px' })
}

for (const vp of PHONES) {
  test(`${vp.name}: hidden at the top, visible once the map scrolls out of view`, async ({ browser }) => {
    const { name, ...opts } = vp
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    await page.goto('/')
    await padPageFoot(page)
    await expect(page.locator('.back-to-map')).toBeHidden()

    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    await expect(page.locator('.back-to-map')).toBeVisible()
    await ctx.close()
  })

  test(`${vp.name}: tapping it returns scrollY to the top of the map`, async ({ browser }) => {
    const { name, ...opts } = vp
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    await page.goto('/')
    await padPageFoot(page)
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    await expect(page.locator('.back-to-map')).toBeVisible()

    await page.locator('.back-to-map').click()
    await expect.poll(() => page.evaluate(() => {
      const top = document.querySelector('.map-shell').getBoundingClientRect().top
      return Math.abs(top) <= 8
    })).toBe(true)
    await ctx.close()
  })

  test(`${vp.name}: hidden while the map is full screen, even scrolled away`, async ({ browser }) => {
    const { name, ...opts } = vp
    const ctx = await browser.newContext(opts)
    const page = await ctx.newPage()
    await page.goto('/')
    await page.locator('.map__full').click()
    await expect.poll(() => page.evaluate(() => {
      const map = document.querySelector('#map')
      return document.fullscreenElement === map || map.classList.contains('map--faux-full')
    })).toBe(true)
    await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
    await expect(page.locator('.back-to-map')).toBeHidden()
    await ctx.close()
  })
}

test(`${DESKTOP.name}: never shown on desktop`, async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.setViewportSize(DESKTOP.viewport)
  await page.goto('/')
  await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' }))
  await expect(page.locator('.back-to-map')).toBeHidden()
  await page.close()
})

test('not rendered on /embed', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.setViewportSize(PHONES[0].viewport)
  await page.goto('/embed')
  await expect(page.locator('.back-to-map')).toHaveCount(0)
  await page.close()
})
