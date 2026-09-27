import { test, expect } from './fixtures.js'

// SEO6 §3: /areas is the crawlable directory — every area the API knows
// about must have a link from the server-rendered page, with no JavaScript,
// in both languages.
test('the areas directory links every area the API returns', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  const res = await page.request.get('/api/v1/areas')
  const { areas } = await res.json()
  expect(areas.length).toBeGreaterThan(0)

  for (const prefix of ['', '/en']) {
    await page.goto(`${prefix}/areas`)
    // Scoped to .areas-directory: the ranked table above it links every area
    // too (by design, sorted by reading, not geography), so an unscoped
    // locator double-counts every area, oblasts included as their own
    // group heading link.
    for (const area of areas) {
      const link = page.locator(`.areas-directory a[href="${prefix}/area/${area.slug}"]`)
      await expect(link, `no link to ${area.slug} on ${prefix}/areas`).toHaveCount(1)
    }
  }

  await context.close()
})

// The district seeded for SEO6 (internal/e2e/e2e_test.go's "mladost", inside
// the "sofia" city fixture) must show its air-now sentence and a link back to
// its parent city with no JavaScript — the no-JS reader gets the same
// breadcrumb/link content a scripted browser builds client-side.
test('a district page shows the air-now sentence and its parent link with JS disabled', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false })
  const page = await context.newPage()

  await page.goto('/area/mladost')
  await expect(page.locator('.area-now')).toBeVisible()
  await expect(page.locator('.area-links a[href="/area/sofia"]')).toHaveCount(1)

  await context.close()
})
