import { test, expect } from './fixtures.js'

// The About page carries the animated 1B mascot, with alt text per language.
for (const [path, alt] of [['/about', 'Талисманът на Канарче: канарче самурай'], ['/en/about', 'Kanarche mascot: a samurai canary']]) {
  test(`${path}: the mascot is shown with its alt text`, async ({ ctx }) => {
    const page = await ctx.newPage()
    await page.goto(path)
    const img = page.locator('.page-head img.about-mascot')
    await expect(img).toHaveAttribute('data-logo', 'kanarche-1b-mascot')
    await expect(img).toHaveAttribute('alt', alt)
    const res = await page.request.get(await img.getAttribute('src'))
    expect(res.status()).toBe(200)
    const svg = await res.text()
    expect(svg).toContain('@keyframes')
    expect(svg).toContain('prefers-reduced-motion')
    expect(await img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0)
    await page.close()
  })
}
