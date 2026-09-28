import { describe, it, expect } from 'vitest'
import { windfxMode, toUV, idw } from '../windstreaks.js'

describe('windfxMode', () => {
  it('is arrows without the flag', () => expect(windfxMode('', false)).toBe('arrows'))
  it('is streaks with the flag', () => expect(windfxMode('?windfx=streaks', false)).toBe('streaks'))
  it('falls back to arrows under reduced motion', () => expect(windfxMode('?windfx=streaks', true)).toBe('arrows'))
})

describe('field', () => {
  const body = { forecast: true, vectors: [{ lon: 25, lat: 42, speed_ms: 4, direction_deg: 270 }] }
  it('turns a westerly into an eastward u', () => {
    const [v] = toUV(body)
    expect(v.u).toBeCloseTo(4)
    expect(v.v).toBeCloseTo(0)
  })
  it('refuses a body not marked as forecast', () => expect(toUV({ vectors: body.vectors })).toEqual([]))
  it('has no value far from every vector', () => expect(idw(toUV(body), 27, 42)).toBeNull())
  it('reproduces the vector on top of it', () => expect(idw(toUV(body), 25, 42)[0]).toBeCloseTo(4))
})
