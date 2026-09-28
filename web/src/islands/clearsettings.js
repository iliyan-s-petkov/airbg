// "Clear my settings" — the About page's privacy section, OpenProject #585.
//
// The keys to remove travel as a data-keys attribute the server renders from
// storage-keys.json (see about.gohtml and internal/web/storagekeys.go), not a
// list hardcoded here: a key the allow-list drops would otherwise stay a dead
// line in this file, and one it gains would silently not get cleared.
import { safeStorage } from '../lib/storage.js'

// clearKeys removes exactly `keys` from `storage`, leaving every other stored
// key — a foreign key, or one this site does not use — untouched.
export function clearKeys(keys, storage = safeStorage()) {
  if (!storage) return
  for (const key of keys) {
    try {
      storage.removeItem(key)
    } catch {
      // private mode / blocked storage: nothing was set, nothing to clear
    }
  }
}

// storage is a parameter, not always safeStorage(), so a test can inject a
// double and assert on it directly instead of reaching into jsdom's real
// localStorage.
export function mount(el, storage = safeStorage()) {
  const keys = (el.dataset.keys ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
  const button = el.querySelector('button')
  const status = el.querySelector('[data-role="status"]')

  button?.addEventListener('click', () => {
    clearKeys(keys, storage)
    if (status) status.textContent = el.dataset.confirm ?? ''
  })
}
