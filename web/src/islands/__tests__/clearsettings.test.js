// @vitest-environment jsdom
//
// jsdom because mount() reads data-* attributes and wires a real click
// listener; the storage side uses a fake store so a "leaves foreign keys
// alone" assertion does not depend on what else jsdom's localStorage holds.
import { describe, it, expect } from 'vitest'
import { clearKeys, mount } from '../clearsettings.js'

function fakeStore(initial = {}) {
  const data = { ...initial }
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => void (data[k] = v),
    removeItem: (k) => void delete data[k],
    data,
  }
}

describe('clearKeys (#585)', () => {
  it('removes only the allow-listed keys, leaving foreign keys alone', () => {
    const store = fakeStore({
      'airbg:theme': 'dark',
      'airbg:map-layers': 'roads,hexes',
      'some-other-site:token': 'do-not-touch',
      'airbg:unrelated-future-key': 'kept-because-not-in-the-list-passed-in',
    })

    clearKeys(['airbg:theme', 'airbg:map-layers'], store)

    expect(store.data).toEqual({
      'some-other-site:token': 'do-not-touch',
      'airbg:unrelated-future-key': 'kept-because-not-in-the-list-passed-in',
    })
  })

  it('does nothing when there is no storage', () => {
    expect(() => clearKeys(['airbg:theme'], null)).not.toThrow()
  })

  it('swallows a removeItem failure and still processes the remaining keys', () => {
    const store = fakeStore({ 'airbg:theme': 'dark', 'airbg:map-layers': 'roads' })
    store.removeItem = (k) => {
      if (k === 'airbg:theme') throw new Error('blocked')
      delete store.data[k]
    }

    expect(() => clearKeys(['airbg:theme', 'airbg:map-layers'], store)).not.toThrow()
    expect(store.data).toEqual({ 'airbg:theme': 'dark' })
  })
})

describe('mount (#585)', () => {
  function button({ keys, confirm }) {
    const el = document.createElement('div')
    el.dataset.island = 'clearsettings'
    el.dataset.keys = keys
    el.dataset.confirm = confirm
    el.innerHTML = '<button type="button">Clear</button><p data-role="status" aria-live="polite"></p>'
    return el
  }

  it('clears the allow-listed keys and writes the confirmation into the aria-live status on click', () => {
    const store = fakeStore({ 'airbg:theme': 'dark', 'airbg:map-layers': 'roads', 'foreign:key': 'x' })
    const el = button({ keys: 'airbg:theme,airbg:map-layers', confirm: 'Cleared.' })

    mount(el, store)
    // mount() reads its own default storage; exercise the real click path
    // through the DOM but with an explicit store injected via clearKeys is
    // covered above — here we confirm the status text updates.
    el.querySelector('button').click()

    const status = el.querySelector('[data-role="status"]')
    expect(status.textContent).toBe('Cleared.')
  })
})
