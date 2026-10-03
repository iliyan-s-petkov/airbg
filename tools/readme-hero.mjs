// Renders the README hero images (1600x900, light and dark) from the live site.
// Usage: node tools/readme-hero.mjs [outDir]  (screenshots SITE_URL/en/; default outDir is docs/images)
import { chromium } from '../web/node_modules/playwright/index.mjs'
import { execFileSync } from 'node:child_process'

const SITE = process.env.SITE_URL || 'https://kanarche.eu'
const OUT_DIR = process.argv[2] || new URL('../docs/images/', import.meta.url).pathname
const W = 1600, H = 900
const SETTLE_MS = 4000 // prod has no map handle to poll, so wait after network idle

const browser = await chromium.launch()

// Full-viewport screenshot of the live page as a data URI.
const shoot = async (scheme, viewport, mobile) => {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme: scheme, isMobile: mobile, hasTouch: mobile })
  const page = await ctx.newPage()
  const res = await page.goto(`${SITE}/en/`, { waitUntil: 'networkidle' })
  if (!res.ok()) throw new Error(`${SITE}/en/ answered ${res.status()}`)
  await page.waitForTimeout(SETTLE_MS)
  const buf = await page.screenshot()
  await ctx.close()
  return 'data:image/png;base64,' + buf.toString('base64')
}

const PALETTE = {
  light: { bg: 'linear-gradient(135deg,#e8f1f2,#c9dde0)', bar: '#e9e9ec', barLine: '#d2d2d6', url: '#fff', urlText: '#5b6670', shadow: 'rgba(16,48,59,.35)' },
  dark: { bg: 'linear-gradient(135deg,#0a1820,#143441)', bar: '#2b2f33', barLine: '#1b1e21', url: '#1b1e21', urlText: '#9aa5ab', shadow: 'rgba(0,0,0,.6)' },
}

const compose = (p, desktop, phone) => `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0}
body{width:${W}px;height:${H}px;overflow:hidden;background:${p.bg};position:relative;font-family:"Inter","Helvetica Neue",Arial,sans-serif}
.win{position:absolute;left:80px;top:62px;width:1180px;border-radius:12px;overflow:hidden;background:${p.bar};box-shadow:0 30px 70px ${p.shadow},0 0 0 1px ${p.barLine}}
.bar{height:38px;display:flex;align-items:center;padding:0 14px;border-bottom:1px solid ${p.barLine}}
.dot{width:12px;height:12px;border-radius:50%;margin-right:8px}
.url{margin:0 auto;transform:translateX(-30px);width:380px;height:24px;border-radius:7px;background:${p.url};color:${p.urlText};font-size:13px;line-height:24px;text-align:center}
.win img{display:block;width:1180px;height:737px}
.phone{position:absolute;left:1230px;top:200px;padding:12px;border-radius:44px;background:#111;box-shadow:0 30px 70px ${p.shadow},0 0 0 2px #3a3a3c}
.phone img{display:block;width:280px;height:606px;border-radius:32px}
</style><body>
<div class="win"><div class="bar"><i class="dot" style="background:#ff5f57"></i><i class="dot" style="background:#febc2e"></i><i class="dot" style="background:#28c840"></i><div class="url">${SITE.replace(/^https?:\/\//, '')}/en/</div></div><img src="${desktop}"></div>
<div class="phone"><img src="${phone}"></div>
</body>`

for (const scheme of ['light', 'dark']) {
  const desktop = await shoot(scheme, { width: 1440, height: 900 }, false)
  const phone = await shoot(scheme, { width: 390, height: 844 }, true)
  const ctx = await browser.newContext({ viewport: { width: W, height: H } })
  const page = await ctx.newPage()
  await page.setContent(compose(PALETTE[scheme], desktop, phone))
  await page.waitForLoadState('load')
  const out = `${OUT_DIR}hero-${scheme}.png`
  await page.screenshot({ path: out })
  await ctx.close()
  try { execFileSync('pngquant', ['--force', '--quality=30-70', '--speed=1', '96', '--output', out, out]) } catch { /* pngquant is optional */ }
  console.log('wrote', out)
}
await browser.close()
