import { describe, it, expect } from 'vitest'
import { visitorSeries } from '../visitors.js'

const day = (d, uniques) => ({ day: d, uniques, requests: 9999, page_views: 8888 })

describe('visitorSeries', () => {
  it('plots uniques only, on epoch-second UTC midnights', () => {
    const body = { generated_at: '2026-09-28T00:00:00Z', days: [day('2026-09-26', 10), day('2026-09-27', 25), day('2026-09-28', 17)] }
    const result = visitorSeries(body)
    const [xs, ys] = result
    expect(ys).toEqual([10, 25, 17])
    expect(xs).toEqual([
      Date.parse('2026-09-26T00:00:00Z') / 1000,
      Date.parse('2026-09-27T00:00:00Z') / 1000,
      Date.parse('2026-09-28T00:00:00Z') / 1000,
    ])
    // requests and page_views must not leak in as extra series or values
    expect(result).toHaveLength(2)
    expect(ys).not.toContain(9999)
    expect(ys).not.toContain(8888)
  })

  it('orders days ascending even when the server does not', () => {
    const [xs, ys] = visitorSeries({ days: [day('2026-09-28', 3), day('2026-09-26', 1), day('2026-09-27', 2)] })
    expect(ys).toEqual([1, 2, 3])
    expect(xs).toEqual([...xs].sort((a, b) => a - b))
  })

  it('returns null when there is nothing to draw', () => {
    expect(visitorSeries({ days: [] })).toBeNull()
    expect(visitorSeries({})).toBeNull()
    expect(visitorSeries(null)).toBeNull()
    // one point is a number, not a trend
    expect(visitorSeries({ days: [day('2026-09-28', 5)] })).toBeNull()
  })

  it('drops rows without a usable day or count instead of inventing a point', () => {
    const body = { days: [day('2026-09-26', 4), { day: 'nope', uniques: 5 }, { day: '2026-09-27', uniques: null }, day('2026-09-28', 6)] }
    expect(visitorSeries(body)[1]).toEqual([4, 6])
  })
})
