// The starred sensor as shared reactive state, so every star on the page agrees.
import { safeStorage } from './storage.js'
import { readFavourite, writeFavourite, clearFavourite } from './favourite.js'

export function createFavouriteStore(storage = safeStorage()) {
  let id = $state(readFavourite(storage))
  return {
    get id() { return id },
    // Starring the starred sensor removes it; starring another replaces it.
    toggle(sensorId) {
      if (id === sensorId) {
        clearFavourite(storage)
        id = null
        return
      }
      writeFavourite(sensorId, storage)
      id = sensorId
    },
  }
}

let shared = null
export function getFavourite() {
  if (shared === null) shared = createFavouriteStore()
  return shared
}

export function resetFavouriteForTests() {
  shared = null
}
