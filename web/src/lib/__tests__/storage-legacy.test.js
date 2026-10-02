import { describe, it, expect } from 'vitest'
import { legacyKey, withLegacyFallback, readFlag, writeFlag, readChoice } from '../storage.js'
import { STORAGE_KEY as LAYERS_KEY } from '../maplayers.js'
import { WINDOW_STORAGE_KEY } from '../mapwindow.js'
import { AUTO_KEY } from '../freshness.js'
import { LEGEND_FOLD_KEY, PLAY_SPEED_KEY } from '../mapconfig.js'
import { STORAGE_KEY as THEME_KEY } from '../../islands/theme.js'

function store(initial = {}) {
  const data = { ...initial }
  return {
    data,
    getItem: (k) => (k in data ? data[k] : null),
    setItem: (k, v) => void (data[k] = String(v)),
    removeItem: (k) => void delete data[k],
  }
}

describe('storage keys', () => {
  it('are namespaced kanarche:*', () => {
    for (const key of [LAYERS_KEY, WINDOW_STORAGE_KEY, AUTO_KEY, LEGEND_FOLD_KEY, PLAY_SPEED_KEY, THEME_KEY]) {
      expect(key).toMatch(/^kanarche:/)
    }
  })

  it('legacyKey maps a kanarche key to its airbg predecessor and nothing else', () => {
    expect(legacyKey('kanarche:theme')).toBe('airbg:theme')
    expect(legacyKey('foreign:theme')).toBeNull()
  })
})

describe('withLegacyFallback', () => {
  it('reads the old airbg key when the new one is unset', () => {
    const s = withLegacyFallback(store({ 'airbg:theme': 'dark' }))
    expect(s.getItem('kanarche:theme')).toBe('dark')
  })

  it('prefers the new key over the old one', () => {
    const s = withLegacyFallback(store({ 'airbg:theme': 'dark', 'kanarche:theme': 'light' }))
    expect(s.getItem('kanarche:theme')).toBe('light')
  })

  it('does not fall back for a key outside the kanarche namespace', () => {
    const s = withLegacyFallback(store({ 'airbg:x': '1' }))
    expect(s.getItem('other:x')).toBeNull()
  })

  it('writes the new key only and drops the old one', () => {
    const raw = store({ 'airbg:theme': 'dark' })
    withLegacyFallback(raw).setItem('kanarche:theme', 'light')
    expect(raw.data).toEqual({ 'kanarche:theme': 'light' })
  })

  it('removes both keys, so a cleared setting cannot resurface from the old one', () => {
    const raw = store({ 'airbg:theme': 'dark', 'kanarche:theme': 'dark' })
    withLegacyFallback(raw).removeItem('kanarche:theme')
    expect(raw.data).toEqual({})
  })

  it('survives a store with no removeItem and one that throws on it', () => {
    const noRemove = { getItem: () => null, setItem() {} }
    expect(() => withLegacyFallback(noRemove).setItem('kanarche:a', '1')).not.toThrow()
    const throwing = { ...store(), removeItem() { throw new Error('blocked') } }
    expect(() => withLegacyFallback(throwing).setItem('kanarche:a', '1')).not.toThrow()
  })

  it('passes null storage through', () => {
    expect(withLegacyFallback(null)).toBeNull()
  })
})

describe('the read helpers over a wrapped store', () => {
  it('readFlag and readChoice honour a value saved under the old key', () => {
    const s = withLegacyFallback(store({ 'airbg:auto-refresh': 'false', 'airbg:play-speed': '2' }))
    expect(readFlag(AUTO_KEY, true, s)).toBe(false)
    expect(readChoice(PLAY_SPEED_KEY, [0.5, 1, 2], 1, s)).toBe(2)
  })

  it('writeFlag migrates: the value lands under the new key and the old is gone', () => {
    const raw = store({ 'airbg:legend-open': 'true' })
    writeFlag(LEGEND_FOLD_KEY, false, withLegacyFallback(raw))
    expect(raw.data).toEqual({ 'kanarche:legend-open': 'false' })
  })
})
