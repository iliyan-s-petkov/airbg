// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import {
  FAVOURITE_KEY, parseFavourite, readFavourite, writeFavourite, clearFavourite, openFavouriteSensor,
} from '../favourite.js'
import { LAST_VIEW_KEY } from '../lastview.js'

const memory = (initial = {}) => {
  const store = { ...initial }
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v },
    removeItem: (k) => { delete store[k] },
    has: (k) => k in store,
    raw: (k) => store[k],
  }
}

const hostile = () => ({
  getItem() { throw new Error('denied') },
  setItem() { throw new Error('denied') },
  removeItem() { throw new Error('denied') },
})

describe('FAVOURITE_KEY', () => {
  it('uses the kanarche: prefix', () => {
    expect(FAVOURITE_KEY).toBe('kanarche:favourite-sensor')
  })
})

describe('parseFavourite', () => {
  it('accepts a plain sensor id', () => {
    expect(parseFavourite('101')).toBe(101)
  })

  it.each([
    ['null', null], ['empty', ''], ['text', 'abc'], ['a float', '1.5'], ['negative', '-3'], ['zero', '0'],
    ['exponent', '1e3'], ['padded', ' 7'], ['JSON', '{"id":7}'], ['too big', '99999999999999999999'], ['a number', 7],
  ])('rejects %s', (_n, raw) => {
    expect(parseFavourite(raw)).toBeNull()
  })
})

describe('readFavourite / writeFavourite / clearFavourite', () => {
  it('round-trips only the id', () => {
    const s = memory()
    writeFavourite(101, s)
    expect(s.raw(FAVOURITE_KEY)).toBe('101')
    expect(readFavourite(s)).toBe(101)
  })

  it('reads a tampered value as no favourite', () => {
    expect(readFavourite(memory({ [FAVOURITE_KEY]: '<script>' }))).toBeNull()
  })

  it('refuses to write something that is not an id', () => {
    const s = memory()
    writeFavourite('x', s)
    writeFavourite(-1, s)
    writeFavourite(2.5, s)
    expect(s.has(FAVOURITE_KEY)).toBe(false)
  })

  it('clear removes the key', () => {
    const s = memory({ [FAVOURITE_KEY]: '5' })
    clearFavourite(s)
    expect(s.has(FAVOURITE_KEY)).toBe(false)
  })

  it('survives storage that throws, and a missing storage', () => {
    expect(readFavourite(hostile())).toBeNull()
    expect(() => writeFavourite(1, hostile())).not.toThrow()
    expect(() => clearFavourite(hostile())).not.toThrow()
    expect(readFavourite(null)).toBeNull()
  })
})

describe('openFavouriteSensor', () => {
  const home = { rememberView: true }
  const none = { hash: '', search: '' }
  const args = (over = {}) => {
    const vs = { openSensor: vi.fn(), sensorId: null }
    const open = vi.fn(async () => true)
    return { vs, open, call: (cfg = home, o = {}) => openFavouriteSensor('map', 'state', cfg, 'chrome', vs, { ...none, open, ...over, ...o }) }
  }

  it('opens the favourite as a deep link and then shows its card', async () => {
    const storage = memory({ [FAVOURITE_KEY]: '101' })
    const { vs, open, call } = args()
    expect(await call(home, { storage })).toBe(true)
    expect(open).toHaveBeenCalledOnce()
    const [map, state, cfg, chrome, probe, , opts] = open.mock.calls[0]
    expect([map, state, cfg, chrome]).toEqual(['map', 'state', home, 'chrome'])
    expect(probe.sensorId).toBe(101)
    expect(opts).toEqual({ paint: false })
    expect(vs.openSensor).toHaveBeenCalledWith(101)
  })

  it('does nothing off the home map', async () => {
    const { vs, open, call } = args()
    expect(await call({ rememberView: false }, { storage: memory({ [FAVOURITE_KEY]: '101' }) })).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(vs.openSensor).not.toHaveBeenCalled()
  })

  it('does nothing without a favourite', async () => {
    const { open, call } = args()
    expect(await call(home, { storage: memory() })).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('an explicit URL view wins', async () => {
    const { open, call } = args()
    expect(await call(home, { storage: memory({ [FAVOURITE_KEY]: '101' }), hash: '#sensor=7' })).toBe(false)
    expect(open).not.toHaveBeenCalled()
  })

  it('beats a saved view', async () => {
    const saved = JSON.stringify({ lat: 42.7, lng: 25.4, zoom: 9 })
    const { open, call } = args()
    expect(await call(home, { storage: memory({ [FAVOURITE_KEY]: '101', [LAST_VIEW_KEY]: saved }) })).toBe(true)
    expect(open).toHaveBeenCalledOnce()
  })

  it('a sensor that no longer exists is ignored silently and the key is left', async () => {
    const storage = memory({ [FAVOURITE_KEY]: '101' })
    const { vs, call } = args({ open: vi.fn(async () => false) })
    expect(await call(home, { storage })).toBe(false)
    expect(vs.openSensor).not.toHaveBeenCalled()
    expect(storage.raw(FAVOURITE_KEY)).toBe('101')
  })

  it('a lookup that throws is the same as a missing sensor', async () => {
    const storage = memory({ [FAVOURITE_KEY]: '101' })
    const { vs, call } = args({ open: vi.fn(async () => { throw new Error('boom') }) })
    expect(await call(home, { storage })).toBe(false)
    expect(vs.openSensor).not.toHaveBeenCalled()
    expect(storage.raw(FAVOURITE_KEY)).toBe('101')
  })
})
