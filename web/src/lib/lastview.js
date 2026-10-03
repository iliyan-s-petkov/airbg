// The home map's last camera, remembered across visits.
import { safeStorage } from './storage.js'
import { MIN_ZOOM, MAX_ZOOM_CEILING } from './mapconfig.js'

export const LAST_VIEW_KEY = 'kanarche:map-view'

// A saved centre outside this box is stale or tampered: ignored, not clamped.
const BOUNDS = { south: 40.5, north: 45, west: 21.5, east: 29.5 }

// Hash or query keys that say where the map should open; #metric= and #layers= do not.
const VIEW_KEYS = ['sensor', 'lat', 'lng', 'lon', 'zoom']

const finite = (n) => typeof n === 'number' && Number.isFinite(n)

export function parseLastView(raw) {
  if (typeof raw !== 'string' || raw === '') return null
  let v
  try {
    v = JSON.parse(raw)
  } catch {
    return null
  }
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return null
  const { lat, lng, zoom } = v
  if (!finite(lat) || !finite(lng) || !finite(zoom)) return null
  if (lat < BOUNDS.south || lat > BOUNDS.north || lng < BOUNDS.west || lng > BOUNDS.east) return null
  if (zoom < MIN_ZOOM || zoom > MAX_ZOOM_CEILING) return null
  return { lat, lng, zoom }
}

export function readLastView(storage = safeStorage()) {
  try {
    return parseLastView(storage?.getItem(LAST_VIEW_KEY))
  } catch {
    return null
  }
}

export function writeLastView({ lat, lng, zoom }, storage = safeStorage()) {
  const view = { lat: round(lat, 4), lng: round(lng, 4), zoom: round(zoom, 2) }
  const raw = JSON.stringify(view)
  // Refuse what readLastView would refuse, so the key never holds a dead value.
  if (parseLastView(raw) === null) return
  try {
    storage?.setItem(LAST_VIEW_KEY, raw)
  } catch {
    /* private mode, or a full quota: the view is simply not remembered */
  }
}

const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places

export function hasExplicitView(hash, search) {
  for (const source of [hash, search]) {
    const params = new URLSearchParams(String(source || '').replace(/^[#?]/, ''))
    if (VIEW_KEYS.some((k) => params.has(k))) return true
  }
  return false
}

// The one place the opening-view precedence lives: explicit > saved > default.
// A favourite sensor slots in above `saved` here.
export function resolveOpeningView({ hash, search, saved }) {
  if (hasExplicitView(hash, search)) return { source: 'explicit', view: null }
  if (saved) return { source: 'saved', view: saved }
  return { source: 'default', view: null }
}

export const SAVE_DEBOUNCE_MS = 500

// Jumps the map to the saved view when nothing more specific asks for one.
// Home map only: cfg.rememberView is server-rendered on / and nowhere else.
export function restoreLastView(map, cfg, {
  hash = globalThis.location?.hash,
  search = globalThis.location?.search,
  storage = safeStorage(),
} = {}) {
  if (!cfg.rememberView) return false
  const { source, view } = resolveOpeningView({ hash, search, saved: readLastView(storage) })
  if (source !== 'saved') return false
  map.jumpTo({ center: [view.lng, view.lat], zoom: view.zoom })
  return true
}

// Writes the settled camera, debounced, so a pan is one write rather than many.
export function trackLastView(map, cfg, storage = safeStorage()) {
  if (!cfg.rememberView) return
  let timer
  map.on('moveend', () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      const { lng, lat } = map.getCenter()
      writeLastView({ lat, lng, zoom: map.getZoom() }, storage)
    }, SAVE_DEBOUNCE_MS)
  })
}
