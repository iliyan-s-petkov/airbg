import { test, expect } from './fixtures.js'

// A visitor who saved a theme under the pre-rename airbg:theme key keeps it:
// theme-init.js reads the old key before first paint.
test('a theme saved under the old airbg:theme key still applies', async ({ ctx }) => {
  const page = await ctx.newPage()
  await page.addInitScript(() => localStorage.setItem('airbg:theme', 'dark'))
  await page.goto('/en/about')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
  await page.close()
})
