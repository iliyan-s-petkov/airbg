// SPIKE #576: animated wind streaks as a 2D canvas over the map. Opt-in via ?windfx=streaks.
import { arrowBearing } from '../islands/wind.js'
import contract from './contract.json'

const GRID_PX = 20
const REACH_KM = 18
const KM_PER_DEG = (Math.PI * contract.hex.earth_radius_km) / 180
// Screen px per millisecond per m/s of wind: 5 m/s moves about 2.7 px per 60 fps frame.
const SPEED_PX_PER_MS = 0.032
const FADE = 0.1
const LINE_ALPHA = 0.5
const AREA_PER_PARTICLE = 1800
const MAX_PARTICLES = 1400
const MAX_AGE = 90

// windfxMode is the flag gate: streaks only when asked for and motion is allowed.
export function windfxMode(search, reducedMotion) {
  const asked = new URLSearchParams(search).get('windfx') === 'streaks'
  return asked && !reducedMotion ? 'streaks' : 'arrows'
}

// toUV turns served vectors into east/north components of where the air goes.
export function toUV(body) {
  if (!body || body.forecast !== true || !Array.isArray(body.vectors)) return []
  return body.vectors.map((v) => {
    const a = (arrowBearing(v.direction_deg) * Math.PI) / 180
    return { lon: v.lon, lat: v.lat, u: v.speed_ms * Math.sin(a), v: v.speed_ms * Math.cos(a) }
  })
}

// idw interpolates u/v at a point from vectors within 30 km; null when none is inside REACH_KM.
export function idw(vectors, lon, lat) {
  const kmLon = KM_PER_DEG * Math.cos((lat * Math.PI) / 180)
  let su = 0
  let sv = 0
  let sw = 0
  let nearest = Infinity
  for (const p of vectors) {
    const dx = (p.lon - lon) * kmLon
    const dy = (p.lat - lat) * KM_PER_DEG
    const d2 = dx * dx + dy * dy
    if (d2 < nearest) nearest = d2
    if (d2 > 900) continue
    const w = 1 / (d2 + 1)
    su += p.u * w
    sv += p.v * w
    sw += w
  }
  if (nearest > REACH_KM * REACH_KM || sw === 0) return null
  return [su / sw, sv / sw]
}

// buildGrid samples the field at screen nodes; vx/vy are screen-space (y down) m/s.
export function buildGrid(vectors, width, height, unproject, bearingDeg = 0) {
  const cols = Math.ceil(width / GRID_PX) + 1
  const rows = Math.ceil(height / GRID_PX) + 1
  const vx = new Float32Array(cols * rows)
  const vy = new Float32Array(cols * rows)
  const ok = new Uint8Array(cols * rows)
  const rot = (bearingDeg * Math.PI) / 180
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const ll = unproject(c * GRID_PX, r * GRID_PX)
      const uv = idw(vectors, ll[0], ll[1])
      if (!uv) continue
      const i = r * cols + c
      // Rotate east/north into screen axes for a rotated map.
      vx[i] = uv[0] * cos - uv[1] * sin
      vy[i] = -(uv[0] * sin + uv[1] * cos)
      ok[i] = 1
    }
  }
  return { cols, rows, vx, vy, ok }
}

// sample bilinear-blends the four surrounding nodes; null off the field.
export function sample(g, x, y) {
  const fx = x / GRID_PX
  const fy = y / GRID_PX
  const c = Math.floor(fx)
  const r = Math.floor(fy)
  if (c < 0 || r < 0 || c + 1 >= g.cols || r + 1 >= g.rows) return null
  const tx = fx - c
  const ty = fy - r
  let ax = 0
  let ay = 0
  let aw = 0
  for (let j = 0; j < 4; j++) {
    const i = (r + (j >> 1)) * g.cols + c + (j & 1)
    if (!g.ok[i]) continue
    const w = ((j & 1) ? tx : 1 - tx) * ((j >> 1) ? ty : 1 - ty)
    ax += g.vx[i] * w
    ay += g.vy[i] * w
    aw += w
  }
  return aw > 0.35 ? [ax / aw, ay / aw] : null
}

const running = new WeakMap()

export function startStreaks(map, body, ink, { doc = document, win = window } = {}) {
  // One overlay per map, whoever asks.
  running.get(map)?.stop()
  const vectors = toUV(body)
  const host = map.getCanvasContainer()
  const canvas = doc.createElement('canvas')
  canvas.className = 'map-wind-streaks'
  canvas.setAttribute('aria-hidden', 'true')
  canvas.style.cssText = 'position:absolute;inset:0;pointer-events:none;'
  host.appendChild(canvas)
  const ctx = canvas.getContext('2d')

  let w = 0
  let h = 0
  let grid = null
  let particles = []
  let raf = 0
  let last = 0
  let moving = false

  // Same ink the arrows use: the basemap stays light in both themes, so the theme's --fg would vanish on it in dark.
  const colour = ink

  const seed = (p) => {
    for (let n = 0; n < 6; n++) {
      p.x = Math.random() * w
      p.y = Math.random() * h
      if (sample(grid, p.x, p.y)) break
    }
    p.age = Math.floor(Math.random() * MAX_AGE)
  }

  const rebuild = () => {
    const gl = map.getCanvas()
    w = gl.clientWidth
    h = gl.clientHeight
    const dpr = Math.min(win.devicePixelRatio || 1, 1.5)
    canvas.width = Math.round(w * dpr)
    canvas.height = Math.round(h * dpr)
    canvas.style.width = `${w}px`
    canvas.style.height = `${h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    grid = buildGrid(vectors, w, h, (x, y) => {
      const ll = map.unproject([x, y])
      return [ll.lng, ll.lat]
    }, map.getBearing?.() ?? 0)
    const want = Math.min(MAX_PARTICLES, Math.round((w * h) / AREA_PER_PARTICLE))
    particles = Array.from({ length: want }, () => {
      const p = { x: 0, y: 0, age: 0 }
      seed(p)
      return p
    })
    ctx.clearRect(0, 0, w, h)
  }

  const frame = (now) => {
    raf = win.requestAnimationFrame(frame)
    const dt = Math.min(now - last, 50)
    last = now
    if (moving || !grid) return
    // Fade old trails toward transparent so the hexes underneath never get covered.
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = `rgba(0,0,0,${FADE})`
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'source-over'
    ctx.strokeStyle = colour
    ctx.globalAlpha = LINE_ALPHA
    ctx.lineWidth = 1.3
    ctx.lineCap = 'round'
    ctx.beginPath()
    const k = SPEED_PX_PER_MS * dt
    for (const p of particles) {
      const v = sample(grid, p.x, p.y)
      if (!v || ++p.age > MAX_AGE) {
        seed(p)
        p.age = 0
        continue
      }
      const nx = p.x + v[0] * k
      const ny = p.y + v[1] * k
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(nx, ny)
      p.x = nx
      p.y = ny
    }
    ctx.stroke()
    ctx.globalAlpha = 1
  }

  const run = () => {
    if (raf || doc.hidden) return
    last = win.performance.now()
    raf = win.requestAnimationFrame(frame)
  }
  const halt = () => {
    win.cancelAnimationFrame(raf)
    raf = 0
  }
  const onVisibility = () => (doc.hidden ? halt() : run())
  // Streaks live in screen space, so a move invalidates them: clear, then reseed on moveend.
  const onMoveStart = () => { moving = true; ctx.clearRect(0, 0, w, h) }
  const onMoveEnd = () => { rebuild(); moving = false }

  doc.addEventListener('visibilitychange', onVisibility)
  map.on('movestart', onMoveStart)
  map.on('moveend', onMoveEnd)
  map.on('resize', onMoveEnd)
  rebuild()
  run()

  const handle = {
    stop() {
      running.delete(map)
      halt()
      doc.removeEventListener('visibilitychange', onVisibility)
      map.off('movestart', onMoveStart)
      map.off('moveend', onMoveEnd)
      map.off('resize', onMoveEnd)
      canvas.remove()
    },
  }
  running.set(map, handle)
  return handle
}
