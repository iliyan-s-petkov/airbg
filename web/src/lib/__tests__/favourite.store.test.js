// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { createFavouriteStore } from '../favourite.svelte.js'
import { FAVOURITE_KEY } from '../favourite.js'

const memory = (initial = {}) => {
  const store = { ...initial }
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] },
    raw: (k) => store[k],
  }
}

describe('createFavouriteStore', () => {
  it('starts from a valid stored id and ignores a bad one', () => {
    expect(createFavouriteStore(memory({ [FAVOURITE_KEY]: '101' })).id).toBe(101)
    expect(createFavouriteStore(memory({ [FAVOURITE_KEY]: 'nope' })).id).toBeNull()
  })

  it('toggle stores only the id, and a second toggle removes it', () => {
    const s = memory()
    const fav = createFavouriteStore(s)
    fav.toggle(101)
    expect(fav.id).toBe(101)
    expect(s.raw(FAVOURITE_KEY)).toBe('101')
    fav.toggle(101)
    expect(fav.id).toBeNull()
    expect(s.raw(FAVOURITE_KEY)).toBeUndefined()
  })

  it('starring another sensor replaces the first', () => {
    const s = memory({ [FAVOURITE_KEY]: '101' })
    const fav = createFavouriteStore(s)
    fav.toggle(102)
    expect(fav.id).toBe(102)
    expect(s.raw(FAVOURITE_KEY)).toBe('102')
  })

  it('keeps the star in memory when storage is blocked', () => {
    const fav = createFavouriteStore(null)
    fav.toggle(7)
    expect(fav.id).toBe(7)
  })
})
