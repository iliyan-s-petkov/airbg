// The visitor's starred sensor: an id only, never a location.
import { safeStorage } from './storage.js'
import { resolveOpeningView } from './lastview.js'
import { openDeepLinkedSensor } from './placement.js'
import { getJSON } from './api.js'

export const FAVOURITE_KEY = 'kanarche:favourite-sensor'

// Digits only: anything else in the key is stale or tampered and reads as no favourite.
export function parseFavourite(raw) {
  if (typeof raw !== 'string' || !/^[1-9][0-9]{0,15}$/.test(raw)) return null
  const id = Number(raw)
  return Number.isSafeInteger(id) ? id : null
}

export function readFavourite(storage = safeStorage()) {
  try {
    return parseFavourite(storage?.getItem(FAVOURITE_KEY))
  } catch {
    return null
  }
}

export function writeFavourite(id, storage = safeStorage()) {
  const raw = String(id)
  // Refuse what readFavourite would refuse, so the key never holds a dead value.
  if (parseFavourite(raw) === null) return
  try {
    storage?.setItem(FAVOURITE_KEY, raw)
  } catch {
    /* private mode, or a full quota: the favourite is simply not remembered */
  }
}

export function clearFavourite(storage = safeStorage()) {
  try {
    storage?.removeItem(FAVOURITE_KEY)
  } catch {
    /* nothing to remove, or storage is blocked */
  }
}

// Opens the home map on the favourite exactly as a #sensor=<id> link would.
// Returns false, leaving the key alone, when the sensor is unknown or not applicable.
export async function openFavouriteSensor(map, state, cfg, chrome, vs, {
  hash = globalThis.location?.hash,
  search = globalThis.location?.search,
  storage = safeStorage(),
  open = openDeepLinkedSensor,
  fetchJSON = getJSON,
} = {}) {
  if (!cfg.rememberView) return false
  const { source, sensorId } = resolveOpeningView({ hash, search, saved: null, favourite: readFavourite(storage) })
  if (source !== 'favourite') return false
  let moved = false
  try {
    moved = await open(map, state, cfg, chrome, { sensorId }, fetchJSON, { paint: false })
  } catch {
    return false
  }
  if (!moved) return false
  vs.openSensor(sensorId)
  return true
}
