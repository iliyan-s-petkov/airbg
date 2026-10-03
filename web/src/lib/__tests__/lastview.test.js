import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  LAST_VIEW_KEY, parseLastView, readLastView, writeLastView,
  hasExplicitView, resolveOpeningView, restoreLastView, trackLastView, SAVE_DEBOUNCE_MS,
} from '../lastview.js'

const memory = (initial) => {
  const store = initial === undefined ? {} : { [LAST_VIEW_KEY]: initial }
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v },
    raw: () => store[LAST_VIEW_KEY],
  }
}

const hostile = () => ({
  getItem() { throw new Error('denied') },
  setItem() { throw new Error('denied') },
})

const good = { lat: 42.7, lng: 25.4, zoom: 9 }

describe('LAST_VIEW_KEY', () => {
  it('uses the kanarche: prefix', () => {
    expect(LAST_VIEW_KEY).toBe('kanarche:map-view')
  })
})

describe('parseLastView', () => {
  it('accepts a centre inside Bulgaria and a sane zoom', () => {
    expect(parseLastView(JSON.stringify(good))).toEqual(good)
  })

  it.each([
    ['null', null],
    ['empty', ''],
    ['bad JSON', '{not json'],
    ['a JSON array', '[1,2,3]'],
    ['a JSON string', '"x"'],
    ['missing zoom', '{"lat":42.7,"lng":25.4}'],
    ['string coordinates', '{"lat":"42.7","lng":"25.4","zoom":9}'],
    ['lat out of range', '{"lat":91,"lng":25.4,"zoom":9}'],
    ['lng out of range', '{"lat":42.7,"lng":181,"zoom":9}'],
    ['zoom below the floor', '{"lat":42.7,"lng":25.4,"zoom":0}'],
    ['zoom above the ceiling', '{"lat":42.7,"lng":25.4,"zoom":30}'],
    ['far outside Bulgaria', '{"lat":48.85,"lng":2.35,"zoom":9}'],
    ['the other side of the world', '{"lat":-33.9,"lng":151.2,"zoom":9}'],
  ])('ignores %s', (_, raw) => {
    expect(parseLastView(raw)).toBeNull()
  })
})

describe('readLastView / writeLastView', () => {
  it('round-trips through storage', () => {
    const s = memory()
    writeLastView(good, s)
    expect(readLastView(s)).toEqual(good)
  })

  it('rounds on write so the key stays short', () => {
    const s = memory()
    writeLastView({ lat: 42.123456789, lng: 25.987654321, zoom: 9.123456 }, s)
    expect(JSON.parse(s.raw())).toEqual({ lat: 42.1235, lng: 25.9877, zoom: 9.12 })
  })

  it('does not write a view it would refuse to read back', () => {
    const s = memory()
    writeLastView({ lat: 0, lng: 0, zoom: 3 }, s)
    expect(s.raw()).toBeUndefined()
  })

  it('reads null from garbage, a missing key, and a hostile storage', () => {
    expect(readLastView(memory('garbage'))).toBeNull()
    expect(readLastView(memory())).toBeNull()
    expect(readLastView(hostile())).toBeNull()
    expect(readLastView(null)).toBeNull()
  })

  it('swallows a hostile or absent storage on write', () => {
    expect(() => writeLastView(good, hostile())).not.toThrow()
    expect(() => writeLastView(good, null)).not.toThrow()
  })
})

describe('hasExplicitView', () => {
  it.each([
    ['#sensor=123', ''],
    ['#metric=P1&sensor=7', ''],
    ['#lat=42.7&lng=25.4&zoom=9', ''],
    ['', '?lat=42.7'],
    ['', '?zoom=9'],
  ])('sees view state in hash %j / query %j', (hash, search) => {
    expect(hasExplicitView(hash, search)).toBe(true)
  })

  it.each([
    ['', ''],
    ['#metric=P1', ''],
    ['#layers=official', ''],
    ['', '?utm_source=x'],
  ])('treats settings-only hash %j / query %j as no view', (hash, search) => {
    expect(hasExplicitView(hash, search)).toBe(false)
  })
})

describe('resolveOpeningView precedence', () => {
  it('explicit beats saved', () => {
    expect(resolveOpeningView({ hash: '#sensor=5', search: '', saved: good }))
      .toEqual({ source: 'explicit', view: null })
  })

  it('saved beats the default', () => {
    expect(resolveOpeningView({ hash: '', search: '', saved: good }))
      .toEqual({ source: 'saved', view: good })
  })

  it('falls through to the default with nothing saved', () => {
    expect(resolveOpeningView({ hash: '', search: '', saved: null }))
      .toEqual({ source: 'default', view: null })
  })

  it('a settings-only hash does not suppress the saved view', () => {
    expect(resolveOpeningView({ hash: '#metric=P1', search: '', saved: good }).source).toBe('saved')
  })
})

// A stand-in for the MapLibre camera: records jumps, stores moveend handlers.
const fakeMap = (centre = { lng: 25.4, lat: 42.7 }, zoom = 7) => {
  const handlers = []
  return {
    jumps: [],
    jumpTo(o) { this.jumps.push(o) },
    on(ev, fn) { if (ev === 'moveend') handlers.push(fn) },
    getCenter: () => centre,
    getZoom: () => zoom,
    fire(e = { originalEvent: {} }) { handlers.forEach((fn) => fn(e)) },
  }
}

describe('restoreLastView', () => {
  const home = { rememberView: true }

  it('jumps to the saved view and says it moved', () => {
    const map = fakeMap()
    const moved = restoreLastView(map, home, { hash: '', search: '', storage: memory(JSON.stringify(good)) })
    expect(moved).toBe(true)
    expect(map.jumps).toEqual([{ center: [25.4, 42.7], zoom: 9 }])
  })

  it('does nothing on a first visit', () => {
    const map = fakeMap()
    expect(restoreLastView(map, home, { hash: '', search: '', storage: memory() })).toBe(false)
    expect(map.jumps).toEqual([])
  })

  it('does nothing when the URL names a sensor', () => {
    const map = fakeMap()
    expect(restoreLastView(map, home, { hash: '#sensor=5', search: '', storage: memory(JSON.stringify(good)) })).toBe(false)
    expect(map.jumps).toEqual([])
  })

  it('does nothing for garbage in the key', () => {
    const map = fakeMap()
    expect(restoreLastView(map, home, { hash: '', search: '', storage: memory('{{{') })).toBe(false)
    expect(map.jumps).toEqual([])
  })

  it('never reads the key off the home page', () => {
    const map = fakeMap()
    const storage = { getItem: vi.fn(() => JSON.stringify(good)) }
    expect(restoreLastView(map, { rememberView: false }, { hash: '', search: '', storage })).toBe(false)
    expect(storage.getItem).not.toHaveBeenCalled()
  })
})

describe('trackLastView', () => {
  afterEach(() => vi.useRealTimers())

  it('saves the settled camera after the debounce', () => {
    vi.useFakeTimers()
    const map = fakeMap({ lng: 25.4, lat: 42.7 }, 9)
    const storage = memory()
    trackLastView(map, { rememberView: true }, storage)
    map.fire()
    expect(storage.raw()).toBeUndefined()
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(JSON.parse(storage.raw())).toEqual(good)
  })

  it('collapses a burst of moves into one write', () => {
    vi.useFakeTimers()
    const storage = { getItem: () => null, setItem: vi.fn() }
    const map = fakeMap({ lng: 25.4, lat: 42.7 }, 9)
    trackLastView(map, { rememberView: true }, storage)
    for (let i = 0; i < 5; i++) map.fire()
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(storage.setItem).toHaveBeenCalledTimes(1)
  })

  it('installs nothing off the home page', () => {
    const map = fakeMap()
    const on = vi.spyOn(map, 'on')
    trackLastView(map, { rememberView: false }, memory())
    expect(on).not.toHaveBeenCalled()
  })

  it('ignores a programmatic move: geoip, locate fly-to, restore', () => {
    vi.useFakeTimers()
    const storage = { getItem: () => null, setItem: vi.fn() }
    const map = fakeMap({ lng: 25.4, lat: 42.7 }, 9)
    trackLastView(map, { rememberView: true }, storage)
    map.fire({})
    map.fire(null)
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('saves a move the zoom buttons flag as the visitor\'s own', () => {
    vi.useFakeTimers()
    const storage = memory()
    const map = fakeMap({ lng: 25.4, lat: 42.7 }, 9)
    trackLastView(map, { rememberView: true }, storage)
    map.fire({ userInitiated: true })
    vi.advanceTimersByTime(SAVE_DEBOUNCE_MS)
    expect(JSON.parse(storage.raw())).toEqual(good)
  })
})
