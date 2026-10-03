// A one-time callout pointing a first-time visitor at the locate button.
import { safeStorage } from './storage.js'
import { hasExplicitView, readLastView } from './lastview.js'

export const LOCATE_HINT_KEY = 'kanarche:locate-hint-seen'
export const HINT_MS = 8000

// First visit to the home map only: nothing saved, no explicit view, never shown before.
export function shouldShowLocateHint(cfg, {
  hash = globalThis.location?.hash,
  search = globalThis.location?.search,
  storage = safeStorage(),
} = {}) {
  if (!cfg.rememberView || !storage) return false
  if (hasExplicitView(hash, search)) return false
  try {
    return readLastView(storage) === null && storage.getItem(LOCATE_HINT_KEY) === null
  } catch {
    return false
  }
}

// Returns a function that removes the hint, or null when it is not shown.
export function installLocateHint(map, locateButton, cfg, {
  text, onActivate, storage = safeStorage(),
  hash = globalThis.location?.hash,
  search = globalThis.location?.search,
}) {
  if (!text || !shouldShowLocateHint(cfg, { hash, search, storage })) return null
  // Marked seen before it is shown: a hint that cannot be remembered would repeat on every visit.
  try {
    storage.setItem(LOCATE_HINT_KEY, '1')
  } catch {
    return null
  }

  const el = document.createElement('div')
  el.className = 'map-locate-hint'
  el.setAttribute('role', 'status')
  const bubble = document.createElement('button')
  bubble.type = 'button'
  bubble.className = 'map-locate-hint__btn'
  bubble.textContent = text
  el.appendChild(bubble)
  locateButton.parentElement.appendChild(el)

  const timer = setTimeout(dismiss, HINT_MS)
  // Only the visitor's own moves (wheel, drag, touch carry an originalEvent) end the hint.
  const onMoveStart = (e) => { if (e?.originalEvent) dismiss() }
  map.on('movestart', onMoveStart)
  map.on('click', dismiss)
  locateButton.addEventListener('click', dismiss)
  bubble.addEventListener('click', () => {
    dismiss()
    onActivate?.()
  })

  function dismiss() {
    clearTimeout(timer)
    map.off('movestart', onMoveStart)
    map.off('click', dismiss)
    locateButton.removeEventListener('click', dismiss)
    el.remove()
  }
  return dismiss
}
