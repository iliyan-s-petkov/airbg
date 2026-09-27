import { test, expect } from './fixtures.js'

// The pull tab (OpenProject #574, plan Task 2, spike option C): a 56x20 tab
// hanging from the map's bottom edge, 64x44 hit area via ::before.
const VIEWPORTS = [
  { name: '393x873', width: 393, height: 873 },
  { name: '360x740', width: 360, height: 740 },
  { name: '873x393', width: 873, height: 393 },
  { name: '740x360', width: 740, height: 360 },
]

const PAGES = ['/', '/area/sofia']

// sofia is a city (boundary note, tallest chrome); sofia-oblast has no note.
const FOLD_PAGES = ['/', '/area/sofia', '/area/sofia-oblast']
const FOLD_VIEWPORTS = [
  { name: '393x873', width: 393, height: 873 },
  { name: '873x393', width: 873, height: 393 },
]

const phoneCtx = (browser, vp) =>
  browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true })

const overlaps = (a, b) =>
  a.x < b.x + b.width && a.x + a.width > b.x &&
  a.y < b.y + b.height && a.y + a.height > b.y

// The real tap target: ::before is out of DOM, so read its computed inset
// off the pseudo-element rather than assume the spike's numbers.
async function tapBox(cue) {
  return cue.evaluate((el) => {
    const r = el.getBoundingClientRect()
    const cs = getComputedStyle(el, '::before')
    const top = parseFloat(cs.top) || 0
    const right = parseFloat(cs.right) || 0
    const bottom = parseFloat(cs.bottom) || 0
    const left = parseFloat(cs.left) || 0
    return { x: r.x + left, y: r.y + top, width: r.width - left - right, height: r.height - top - bottom }
  })
}

async function openLegend(page) {
  const toggle = page.locator('.scale__toggle')
  await toggle.click()
  await expect(page.locator('details.scale--onmap')).toHaveAttribute('open', '')
}

for (const vp of VIEWPORTS) {
  for (const path of PAGES) {
    for (const legendState of ['folded', 'open']) {
      test(`${vp.name} ${path} legend ${legendState}: pull tab sits on the map edge, clear of controls`, async ({ browser }) => {
        const ctx = await phoneCtx(browser, vp)
        const page = await ctx.newPage()
        await page.goto(path)
        // Area chrome varies above the map; the guarantee is for the map at the
        // top, same convention the old strip spec used.
        if (path.includes('/area/')) {
          await page.evaluate(() => document.querySelector('.map-shell').scrollIntoView({ block: 'start', behavior: 'instant' }))
        }
        if (legendState === 'open') await openLegend(page)

        const cue = page.locator('a.scroll-cue')
        await expect(cue).toBeVisible()
        const box = await cue.boundingBox()
        const map = await page.locator('#map, #area-map').first().boundingBox()

        // Fully inside the first viewport.
        expect(box.y).toBeGreaterThanOrEqual(0)
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height)

        // Visual tab is the spike's small pull tab, not the old 44px strip.
        expect(box.width).toBeLessThanOrEqual(57)
        expect(box.height).toBeLessThanOrEqual(21)

        // The tap target (::before) is still >= 44px tall.
        const tap = await tapBox(cue)
        expect(tap.height).toBeGreaterThanOrEqual(44)

        // Straddles the map's bottom edge.
        expect(Math.abs(box.y - (map.y + map.height))).toBeLessThanOrEqual(2)

        for (const sel of ['.scale--onmap', '.map-play', '.map-freshness', '.map-locate', '.scale__info']) {
          const o = await page.locator(sel).first().boundingBox()
          if (o) expect(overlaps(box, o), sel).toBe(false)
        }

        await ctx.close()
      })
    }
  }
}

test('the full 64x44 tap target is hit-testable, not just the visual tab', async ({ browser }) => {
  const vp = VIEWPORTS[0]
  const ctx = await phoneCtx(browser, vp)
  const page = await ctx.newPage()
  await page.goto('/')
  const cue = page.locator('a.scroll-cue')
  await expect(cue).toBeVisible()
  const box = await cue.boundingBox()
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2

  const points = {
    '10px above top edge': { x: centerX, y: box.y - 10 },
    '10px below bottom edge': { x: centerX, y: box.y + box.height + 10 },
    '2px inside left extension': { x: box.x - 2, y: centerY },
    '2px inside right extension': { x: box.x + box.width + 2, y: centerY },
  }

  for (const [label, p] of Object.entries(points)) {
    const hitsCue = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y)
      const cueEl = document.querySelector('a.scroll-cue')
      return !!el && (el === cueEl || cueEl.contains(el))
    }, p)
    expect(hitsCue, `${label} (${p.x}, ${p.y})`).toBe(true)
  }

  await ctx.close()
})

for (const vp of FOLD_VIEWPORTS) {
  for (const path of FOLD_PAGES) {
    test(`${vp.name} ${path}: the pull tab's bottom stays in the first viewport`, async ({ browser }) => {
      const ctx = await phoneCtx(browser, vp)
      const page = await ctx.newPage()
      await page.goto(path)
      const cue = page.locator('a.scroll-cue')
      await expect(cue).toBeVisible()
      const box = await cue.boundingBox()
      expect(box.y + box.height).toBeLessThanOrEqual(vp.height)
      // The fixture's chrome is shorter than prod's, so also pin the area shrink rule itself,
      // with the sensor bar removed as on an uncovered area.
      if (path.includes('/area/') && vp.height > vp.width) {
        const { h, cap } = await page.evaluate(() => {
          document.querySelector('[data-island="sensorbar"]')?.remove()
          const rem = parseFloat(getComputedStyle(document.documentElement).fontSize)
          const h = document.querySelector('.map--wide').getBoundingClientRect().height
          return { h, cap: Math.max(innerHeight - 22 * rem - 20, innerHeight * 0.55) }
        })
        expect(h).toBeLessThanOrEqual(cap + 1)
      }
      await ctx.close()
    })
  }
}

test('the pull tab still scrolls to #below-map without changing the hash', async ({ browser }) => {
  const ctx = await phoneCtx(browser, VIEWPORTS[0])
  const page = await ctx.newPage()
  for (const path of PAGES) {
    await page.goto(path)
    const hash = await page.evaluate(() => location.hash)
    await page.locator('a.scroll-cue').click()
    const strict = path.includes('/area/')
    await expect.poll(() => page.evaluate((strict) => {
      const top = Math.abs(document.getElementById('below-map').getBoundingClientRect().top)
      const atEnd = scrollY >= document.documentElement.scrollHeight - innerHeight - 1
      return top <= 8 || (!strict && atEnd && scrollY > 0)
    }, strict)).toBe(true)
    expect(await page.evaluate(() => location.hash)).toBe(hash)
  }
  await ctx.close()
})

test('the pull tab is hidden while the map is full screen', async ({ browser }) => {
  const ctx = await phoneCtx(browser, VIEWPORTS[0])
  const page = await ctx.newPage()
  await page.goto('/')
  await expect(page.locator('a.scroll-cue')).toBeVisible()
  await page.locator('.map__full').click()
  await expect.poll(() => page.evaluate(() => {
    const map = document.querySelector('#map')
    return document.fullscreenElement === map || map.classList.contains('map--faux-full')
  })).toBe(true)
  await expect(page.locator('a.scroll-cue')).toBeHidden()
  await ctx.close()
})

test('the pull tab is not shown on a 1280x800 desktop', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.setViewportSize({ width: 1280, height: 800 })
  for (const path of PAGES) {
    await page.goto(path)
    await expect(page.locator('#map, #area-map').first()).toBeVisible()
    await expect(page.locator('a.scroll-cue')).toBeHidden()
  }
  await page.close()
})

test('reduced motion: the chevron does not animate', async ({ browser }) => {
  const ctx = await phoneCtx(browser, VIEWPORTS[0])
  const page = await ctx.newPage()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  const name = await page.locator('.scroll-cue__chevron')
    .evaluate((el) => getComputedStyle(el).animationName)
  expect(name).toBe('none')
  await ctx.close()
})
