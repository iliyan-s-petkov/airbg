import { test, expect } from './fixtures.js'

// Header mark is the Kanarche 1B compact logo and every icon link resolves.
test('header mark is the 1B logo and the icon links return 200', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.goto('/en/')
  const mark = page.locator('header.masthead .masthead__brand img')
  await expect(mark).toHaveAttribute('data-logo', 'kanarche-1b')
  const src = await mark.getAttribute('src')
  const svg = await (await page.request.get(src)).text()
  expect(svg).toContain('aria-label="Kanarche"')
  expect(svg).not.toMatch(/<animate|<style/)
  const hrefs = await page.locator('head link[rel="icon"], head link[rel="apple-touch-icon"]').evaluateAll((els) => els.map((e) => e.href))
  expect(hrefs.length).toBeGreaterThanOrEqual(3)
  for (const href of hrefs) {
    const res = await page.request.get(href)
    expect(res.status(), href).toBe(200)
  }
  await page.close()
})
