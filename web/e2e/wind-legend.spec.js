import { test, expect } from './fixtures.js'

// The legend explains the wind streaks, so its wind row follows the Wind layer.

const mockWind = (page) => page.route('**/api/v1/wind', (route) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify({
    generated_at: new Date().toISOString(),
    valid_at: new Date().toISOString(),
    model: 'Test Model',
    model_resolution_deg: 0.25,
    resolution_km: 25,
    forecast: true,
    vectors: [{ lon: 23.3, lat: 42.68, speed_ms: 3.2, direction_deg: 180 }],
  }),
}))

test('the legend wind row appears with the wind layer and goes with it', async ({ ctx }) => {
  const page = await ctx.newPage()
  await mockWind(page)
  await page.addInitScript(() => localStorage.setItem('airbg:legend-open', 'true'))
  await page.goto('/en')

  const row = page.locator('.scale--onmap .scale__wind')
  const wind = page.locator('.map__layers').getByLabel('Wind', { exact: true })
  await page.locator('.map__layers .colmenu__btn').click()
  if (!(await wind.isChecked())) await wind.check()
  await page.keyboard.press('Escape')
  await expect(row).toBeVisible()
  await expect(row).toContainText('Wind: direction and strength')

  await page.locator('.map__layers .colmenu__btn').click()
  await wind.uncheck()
  await expect(row).toBeHidden()
  await page.close()
})
