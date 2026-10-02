// Renders the 1280x640 GitHub social-preview card from live airbg.org data.
// Usage: node tools/social-preview.mjs [out.png]  (reads the public API; default out is the static og:image)
import { chromium } from '../web/node_modules/playwright/index.mjs'

const SITE = process.env.SITE_URL || 'https://airbg.org'
const BASE = `${SITE}/api/v1`
const OUT = process.argv[2] || new URL('../internal/web/static/social-preview.png', import.meta.url).pathname
const W = 1280, H = 640
const REF_LAT = 42.75 // hex lattice reference latitude, from contract.json
const RES_KM = 25, R_KM = 6371 // 25 km is a served tier; cells big enough to carry a readable number

const get = (p) => fetch(BASE + p).then((r) => { if (!r.ok) throw new Error(p + ' ' + r.status); return r.json() })
const [hexBody, windBody, bounds, scales] = await Promise.all([get('/hexes?resolution_km=' + RES_KM), get('/wind'), get('/boundaries'), get('/scales')])
const bands = scales.find((s) => s.name === 'eaqi').bands

// Map frame: Web Mercator (what the live basemap uses) fitted into the right-hand panel.
const MAP = { x: 400, y: 40, w: 840, h: 560 }
const polys = []
for (const f of bounds.features) {
  const g = f.geometry
  for (const poly of g.type === 'Polygon' ? [g.coordinates] : g.coordinates) polys.push(poly)
}
const mx = (lo) => (lo + 180) / 360
const my = (la) => (1 - Math.log(Math.tan(Math.PI / 4 + (la * Math.PI) / 360)) / Math.PI) / 2
let minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9
for (const p of polys) for (const [lo, la] of p[0]) {
  minLon = Math.min(minLon, lo); maxLon = Math.max(maxLon, lo)
  minLat = Math.min(minLat, la); maxLat = Math.max(maxLat, la)
}
// World size in px at the fitted scale; tiles at TZ are drawn scaled by WORLD / (256 * 2^TZ).
const FIT = 0.93
const WORLD = Math.min((MAP.w * FIT) / (mx(maxLon) - mx(minLon)), (MAP.h * FIT) / (my(minLat) - my(maxLat)))
const offX = MAP.x + MAP.w / 2 - ((mx(minLon) + mx(maxLon)) / 2) * WORLD
const offY = MAP.y + MAP.h / 2 - ((my(minLat) + my(maxLat)) / 2) * WORLD
const px = (lo, la) => [offX + mx(lo) * WORLD, offY + my(la) * WORLD]
const unpx = (x, y) => {
  const n = Math.PI - (2 * Math.PI * (y - offY)) / WORLD
  return [((x - offX) / WORLD) * 360 - 180, (180 / Math.PI) * Math.atan(Math.sinh(n))]
}

// OSM raster tiles (the live site's ground layer), fetched here and inlined as data URIs.
const TZ = 8
const tScale = WORLD / (256 * 2 ** TZ)
const tx0 = Math.floor((MAP.x - offX) / WORLD * 2 ** TZ), tx1 = Math.floor((MAP.x + MAP.w - offX) / WORLD * 2 ** TZ)
const ty0 = Math.floor((MAP.y - offY) / WORLD * 2 ** TZ), ty1 = Math.floor((MAP.y + MAP.h - offY) / WORLD * 2 ** TZ)
let tiles = ''
for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
  const r = await fetch(`https://tile.openstreetmap.org/${TZ}/${tx}/${ty}.png`, { headers: { 'User-Agent': `airbg-social-preview/1.0 (${SITE})` } })
  if (!r.ok) throw new Error(`tile ${tx},${ty} ${r.status}`)
  const b64 = Buffer.from(await r.arrayBuffer()).toString('base64')
  const x = offX + (tx / 2 ** TZ) * WORLD, y = offY + (ty / 2 ** TZ) * WORLD
  tiles += `<image href="data:image/png;base64,${b64}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${(256 * tScale + 0.6).toFixed(2)}" height="${(256 * tScale + 0.6).toFixed(2)}"/>`
}
const ringPath = (r) => 'M' + r.map(([lo, la]) => px(lo, la).map((v) => v.toFixed(1)).join(',')).join('L') + 'Z'
const countryPath = polys.map((p) => p.map(ringPath).join('')).join('')

// Point-in-polygon (even-odd over all rings) to keep only hexes centred in Bulgaria.
const inRing = (lo, la, r) => {
  let c = false
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j]
    if (yi > la !== yj > la && lo < ((xj - xi) * (la - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}
const inBG = (lo, la) => polys.some((p) => inRing(lo, la, p[0]) && !p.slice(1).some((h) => inRing(lo, la, h)))

// PM2.5 band colour from the EAQI scale served by /scales.
const colourOf = (v) => (bands.find((b) => b.upper == null || v < b.upper) || bands[bands.length - 1]).colour
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
}

// Hex outline, pointy-top, same formula as web/src/lib/hexes.js hexPolygon.
const size = RES_KM / Math.sqrt(3)
const hexPts = (lo, la) => {
  const pts = []
  for (let i = 0; i < 6; i++) {
    const a = ((60 * i + 30) * Math.PI) / 180
    const dLon = ((size * Math.cos(a)) / (R_KM * Math.cos((REF_LAT * Math.PI) / 180))) * (180 / Math.PI)
    const dLat = ((size * Math.sin(a)) / R_KM) * (180 / Math.PI)
    pts.push(px(lo + dLon, la + dLat).map((v) => v.toFixed(1)).join(','))
  }
  return pts.join(' ')
}
// Readings of 200+ ug/m3 are treated as a faulty sensor and skipped so one outlier cannot dominate the card.
const hexes = hexBody.hexes.filter((h) => h.country === 'BG' && h.values && h.values.P2 != null && h.values.P2 < 200 && inBG(h.lon, h.lat))
const hexFill = hexes.map((h) => `<polygon points="${hexPts(h.lon, h.lat)}" fill="${colourOf(h.values.P2)}" fill-opacity="0.75" stroke="#161616" stroke-opacity="0.7" stroke-width="1.2"/>`).join('')
// Labels are drawn after the streaks so wind never covers a number.
const hexLabels = hexes.map((h) => {
  const [x, y] = px(h.lon, h.lat)
  // Portal hex label: Noto Sans Regular 11, ink #161616, white halo 1.4 (web/src/lib/mappaint.js:234-270; one decimal as there).
  return `<text x="${x.toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="middle" font-family="Noto Sans, sans-serif" font-size="11" font-weight="400" fill="#161616" stroke="#ffffff" stroke-width="2.8" stroke-linejoin="round" paint-order="stroke">${h.values.P2.toFixed(1)}</text>`
}).join('')

// Wind: bilinear interpolation of the 0.25 degree lattice, then frozen streamlines.
const G = 0.25
const vec = new Map()
for (const v of windBody.vectors) {
  const a = (((v.direction_deg + 180) % 360) * Math.PI) / 180 // direction is "from"; flow goes the other way
  vec.set(`${Math.round(v.lon / G)},${Math.round(v.lat / G)}`, [v.speed_ms * Math.sin(a), v.speed_ms * Math.cos(a)])
}
const wind = (lo, la) => {
  const gx = lo / G, gy = la / G, x0 = Math.floor(gx), y0 = Math.floor(gy)
  let su = 0, sv = 0, sw = 0
  for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const e = vec.get(`${x0 + dx},${y0 + dy}`)
    if (!e) continue
    const w = (dx ? gx - x0 : 1 - (gx - x0)) * (dy ? gy - y0 : 1 - (gy - y0))
    su += e[0] * w; sv += e[1] * w; sw += w
  }
  return sw > 0.2 ? [su / sw, sv / sw] : null
}
const RAMP = [[0, [110, 170, 240]], [4, [60, 128, 222]], [8, [32, 90, 200]], [12, [24, 58, 170]]]
const windColour = (s) => {
  s = Math.min(Math.max(s, 0), 12)
  let i = 1
  while (i < RAMP.length - 1 && s > RAMP[i][0]) i++
  const [s0, a] = RAMP[i - 1], [s1, b] = RAMP[i], t = (s - s0) / (s1 - s0)
  return a.map((v, k) => Math.round(v + (b[k] - v) * t))
}
// Seeded PRNG so reruns on the same data give the same card.
let seed = 7
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296)
let streaks = ''
const SPACING = 30, STEPS = 12
for (let gy = MAP.y; gy < MAP.y + MAP.h; gy += SPACING) {
  for (let gx = MAP.x; gx < MAP.x + MAP.w; gx += SPACING) {
    let x = gx + rnd() * SPACING, y = gy + rnd() * SPACING
    if (!inBG(...unpx(x, y))) continue
    const pts = [[x, y]]
    let spd = 0
    for (let i = 0; i < STEPS; i++) {
      const w = wind(...unpx(x, y))
      if (!w) break
      spd = Math.hypot(w[0], w[1])
      const stepPx = 1.2 + spd * 0.5
      const n = Math.max(spd, 0.01)
      x += (w[0] / n) * stepPx; y -= (w[1] / n) * stepPx
      pts.push([x, y])
    }
    if (pts.length < 6) continue
    // Fading trail: each segment is a little more opaque and thicker toward the head.
    for (let i = 1; i < pts.length; i++) {
      const t = i / (pts.length - 1)
      const [r, g, b] = windColour(spd)
      streaks += `<line x1="${pts[i - 1][0].toFixed(1)}" y1="${pts[i - 1][1].toFixed(1)}" x2="${pts[i][0].toFixed(1)}" y2="${pts[i][1].toFixed(1)}" stroke="rgb(${r},${g},${b})" stroke-opacity="${(0.2 + 0.45 * t).toFixed(2)}" stroke-width="${(1 + 0.5 * t).toFixed(2)}" stroke-linecap="round"/>`
    }
  }
}

const bandKeys = [[0, '#50f0e6'], [5, '#50ccaa'], [15, '#f0e641'], [50, '#ff5050'], [90, '#960032']]
const html = `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;background:#0d1f29}
body{width:${W}px;height:${H}px;font-family:"Inter","Helvetica Neue",Arial,sans-serif;overflow:hidden}
</style><body>
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
<defs>
<linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0a1820"/><stop offset="1" stop-color="#143441"/></linearGradient>
<linearGradient id="wr" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="rgb(110,170,240)"/><stop offset="0.33" stop-color="rgb(60,128,222)"/><stop offset="0.66" stop-color="rgb(32,90,200)"/><stop offset="1" stop-color="rgb(24,58,170)"/></linearGradient>
<clipPath id="panel"><rect x="${MAP.x}" y="${MAP.y}" width="${MAP.w}" height="${MAP.h}" rx="22"/></clipPath>
<linearGradient id="fade" gradientUnits="userSpaceOnUse" x1="${MAP.x}" y1="0" x2="${MAP.x + 320}" y2="0"><stop offset="0" stop-color="#0e242e" stop-opacity="1"/><stop offset="0.35" stop-color="#0e242e" stop-opacity="0.85"/><stop offset="1" stop-color="#0e242e" stop-opacity="0"/></linearGradient>
<clipPath id="cc"><path d="${countryPath}"/></clipPath>
<filter id="glow" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
</defs>
<rect width="${W}" height="${H}" fill="url(#bg)"/>
<rect x="${MAP.x}" y="${MAP.y}" width="${MAP.w}" height="${MAP.h}" rx="22" fill="#000" opacity="0.45" filter="url(#glow)"/>
<g clip-path="url(#panel)">
<rect x="${MAP.x}" y="${MAP.y}" width="${MAP.w}" height="${MAP.h}" fill="#f2efe9"/>
${tiles}
<path d="${countryPath}" fill="none" stroke="#10303b" stroke-opacity="0.55" stroke-width="1.5"/>
${hexFill}
<g clip-path="url(#cc)">${streaks}</g>
${hexLabels}
<rect x="${MAP.x}" y="${MAP.y}" width="${MAP.w}" height="${MAP.h}" fill="url(#fade)"/>
<rect x="${MAP.x + MAP.w - 196}" y="${MAP.y + MAP.h - 22}" width="196" height="22" rx="4" fill="#fff" fill-opacity="0.72"/>
<text x="${MAP.x + MAP.w - 10}" y="${MAP.y + MAP.h - 7}" text-anchor="end" font-family="Helvetica Neue, Arial, sans-serif" font-size="12" fill="#333">© OpenStreetMap contributors</text>
</g>
<rect x="${MAP.x + 0.5}" y="${MAP.y + 0.5}" width="${MAP.w - 1}" height="${MAP.h - 1}" rx="22" fill="none" stroke="#fff" stroke-opacity="0.12"/>
<text x="56" y="232" font-size="74" font-weight="800" fill="#fff" letter-spacing="-2">airbg<tspan fill="#3fdccb">.org</tspan></text>
<text x="58" y="285" font-size="29" font-weight="500" fill="#b9d3d6">Live air quality map</text>
<text x="58" y="321" font-size="29" font-weight="500" fill="#b9d3d6">for Bulgaria</text>
<g transform="translate(58,372)">
<rect width="226" height="38" rx="19" fill="#17463f" fill-opacity="0.6" stroke="#3fdccb" stroke-opacity="0.5"/>
<text x="113" y="26" text-anchor="middle" font-size="19" font-weight="600" fill="#5eead9">PM2.5 · PM10 · live</text>
</g>
<g transform="translate(58,452)">
<text y="0" font-size="17" font-weight="700" fill="#8fbcff" letter-spacing="2">WIND</text>
<rect y="12" width="226" height="10" rx="5" fill="url(#wr)"/>
<text y="44" font-size="15" fill="#9db6bb">0</text><text x="226" y="44" text-anchor="end" font-size="15" fill="#9db6bb">12 m/s</text>
</g>
<g transform="translate(58,534)">
<text y="0" font-size="17" font-weight="700" fill="#7fe0d2" letter-spacing="2">PM2.5 µg/m³</text>
${bandKeys.map(([n, c], i) => `<g transform="translate(${i * 45},14)"><rect width="41" height="10" rx="3" fill="${c}"/><text y="32" font-size="14" fill="#9db6bb">${n}</text></g>`).join('')}
</g>
</svg></body>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: W, height: H } })
await page.setContent(html)
await page.screenshot({ path: OUT, clip: { x: 0, y: 0, width: W, height: H } })
await browser.close()
console.log(`wrote ${OUT}: ${hexes.length} hexes, wind valid_at ${windBody.valid_at}`)
