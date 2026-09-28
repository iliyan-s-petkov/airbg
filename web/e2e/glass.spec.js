import { test, expect } from './fixtures.js'

// #578: the open layers list and expanded legend get a frosted, translucent
// surface instead of a solid card, so the map stays visible underneath. This
// asserts the effect is actually there (backdrop-filter, not just a lower-
// alpha background that would look washed out with no blur), that the
// legend's colour bar stays fully opaque (its hexes must match exactly), and
// that body text on the glass still reads at 4.5:1 in the worst case the
// reader can land on: the surface composited over a pure black or pure white
// basemap tile, whichever gives the lower contrast.

const VIEWPORTS = [
  { name: 'phone 393x873', viewport: { width: 393, height: 873 }, isMobile: true, hasTouch: true },
  { name: 'desktop 1280x800', viewport: { width: 1280, height: 800 } },
]

const THEMES = ['light', 'dark']

const withTheme = (page, theme) =>
  page.addInitScript((v) => localStorage.setItem('airbg:theme', v), theme)

const withLegend = (page, open) =>
  page.addInitScript((v) => localStorage.setItem('airbg:legend-open', v), String(open))

const openLayers = async (page) => {
  await page.locator('.map__layers .colmenu__btn').click()
  await expect(page.locator('.map__layers .colmenu__panel')).toBeVisible()
}

// sRGB relative luminance (WCAG 2.x), then the standard contrast ratio.
const luminance = ({ r, g, b }) => {
  const lin = (c) => {
    c /= 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}
const contrast = (l1, l2) => {
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// Chromium's computed style for a color-mix() result is `color(srgb r g b /
// a)` with channels 0-1, not `rgba(...)` with channels 0-255 — the case that
// hits here since --glass-bg's second declaration is a color-mix(). Both
// forms are parsed; the color() one is scaled up to match.
const parseColour = (str) => {
  const rgb = str.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const [r, g, b, a] = rgb[1].split(',').map((s) => parseFloat(s))
    return { r, g, b, a: a === undefined ? 1 : a }
  }
  const colourFn = str.match(/^color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\)$/)
  if (colourFn) {
    const [, r, g, b, a] = colourFn.map((s) => (s === undefined ? undefined : parseFloat(s)))
    return { r: r * 255, g: g * 255, b: b * 255, a: a === undefined ? 1 : a }
  }
  return null
}

// The surface's own colour is translucent, so what a reader actually sees is
// it blended over whatever the map tile under it happens to be. Composited
// over pure black and pure white are the two extremes; the worse (lower) of
// the two contrasts against the text colour is the number that has to clear
// 4.5:1, because a reader has no control over what is under the panel.
const worstCaseContrast = (surfaceRgba, textRgb) => {
  const overBlack = {
    r: surfaceRgba.r * surfaceRgba.a,
    g: surfaceRgba.g * surfaceRgba.a,
    b: surfaceRgba.b * surfaceRgba.a,
  }
  const overWhite = {
    r: surfaceRgba.r * surfaceRgba.a + 255 * (1 - surfaceRgba.a),
    g: surfaceRgba.g * surfaceRgba.a + 255 * (1 - surfaceRgba.a),
    b: surfaceRgba.b * surfaceRgba.a + 255 * (1 - surfaceRgba.a),
  }
  const lText = luminance(textRgb)
  return Math.min(contrast(luminance(overBlack), lText), contrast(luminance(overWhite), lText))
}

for (const vp of VIEWPORTS) {
  test.describe(vp.name, () => {
    for (const theme of THEMES) {
      test.describe(theme, () => {
        test('open layers list is frosted glass, not a solid card', async ({ browser }) => {
          const { name, ...opts } = vp
          const context = await browser.newContext(opts)
          const page = await context.newPage()
          await withTheme(page, theme)
          await page.goto('/en')
          await openLayers(page)

          const panel = page.locator('.map__layers .colmenu__panel')
          const style = await panel.evaluate((el) => {
            const cs = getComputedStyle(el)
            return {
              backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
              backgroundColor: cs.backgroundColor,
            }
          })
          expect(style.backdropFilter, 'layers panel has no backdrop-filter').not.toBe('none')
          expect(style.backdropFilter, 'layers panel has no backdrop-filter').toBeTruthy()
          expect(style.backdropFilter).toMatch(/blur\(/)

          const surface = parseColour(style.backgroundColor)
          expect(surface, `unparseable background-color ${style.backgroundColor}`).not.toBeNull()
          expect(surface.a, 'layers panel background is fully opaque, not translucent').toBeLessThan(1)
          expect(surface.a, 'layers panel background is nearly invisible').toBeGreaterThan(0.5)

          const textColour = await panel.locator('.colmenu__opt').first().evaluate((el) => getComputedStyle(el).color)
          const text = parseColour(textColour)
          const ratio = worstCaseContrast(surface, text)
          expect(ratio, `layers panel text contrast ${ratio.toFixed(2)}:1 in the worst case (black/white basemap)`).toBeGreaterThanOrEqual(4.5)

          await context.close()
        })

        test('expanded legend is frosted glass with an opaque colour bar', async ({ browser }) => {
          const { name, ...opts } = vp
          const context = await browser.newContext(opts)
          const page = await context.newPage()
          await withTheme(page, theme)
          await withLegend(page, true)
          await page.goto('/en')

          const legend = page.locator('.scale--onmap')
          await expect(legend).toHaveAttribute('open', '')

          const style = await legend.evaluate((el) => {
            const cs = getComputedStyle(el)
            return {
              backdropFilter: cs.backdropFilter || cs.webkitBackdropFilter,
              backgroundColor: cs.backgroundColor,
            }
          })
          expect(style.backdropFilter, 'legend has no backdrop-filter').not.toBe('none')
          expect(style.backdropFilter, 'legend has no backdrop-filter').toBeTruthy()
          expect(style.backdropFilter).toMatch(/blur\(/)

          const surface = parseColour(style.backgroundColor)
          expect(surface, `unparseable background-color ${style.backgroundColor}`).not.toBeNull()
          expect(surface.a, 'legend background is fully opaque, not translucent').toBeLessThan(1)
          expect(surface.a, 'legend background is nearly invisible').toBeGreaterThan(0.5)

          const nameEl = legend.locator('.scale__band-name').first()
          const textColour = await nameEl.evaluate((el) => getComputedStyle(el).color)
          const text = parseColour(textColour)
          const ratio = worstCaseContrast(surface, text)
          expect(ratio, `legend text contrast ${ratio.toFixed(2)}:1 in the worst case (black/white basemap)`).toBeGreaterThanOrEqual(4.5)

          // The colour bar is the data: its hexes have to match exactly, so it
          // stays fully opaque and unaffected by the surface's translucency.
          const swatches = await legend.locator('.scale__band-swatch rect').evaluateAll((els) =>
            els.map((el) => ({
              fill: el.getAttribute('fill'),
              opacity: getComputedStyle(el).opacity,
              filter: getComputedStyle(el).filter,
            })),
          )
          expect(swatches.length, 'no legend band swatches found').toBeGreaterThan(0)
          for (const s of swatches) {
            expect(s.fill, 'swatch fill is not a solid colour').toMatch(/^#[0-9a-fA-F]{6}$/)
            expect(s.opacity, 'swatch has been made translucent').toBe('1')
            expect(s.filter, 'swatch has a filter applied (should stay unblurred)').toBe('none')
          }

          await context.close()
        })
      })
    }
  })
}
