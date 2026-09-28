import { describe, it, expect } from 'vitest'
import { relativeAge } from '../relativeage.js'

const NOW = Date.parse('2026-09-28T12:00:00Z')
const ago = (ms) => NOW - ms

describe('relativeAge', () => {
  it('says minutes in Bulgarian', () => {
    expect(relativeAge(ago(4 * 60000), NOW, 'bg')).toMatch(/^преди 4 мин/)
  })
  it('says minutes in English', () => {
    expect(relativeAge(ago(4 * 60000), NOW, 'en')).toMatch(/^4 min/)
  })
  it('rounds under a minute to 0 minutes', () => {
    expect(relativeAge(ago(20000), NOW, 'en')).toMatch(/^0 min/)
  })
  it('switches to hours and days', () => {
    expect(relativeAge(ago(3 * 3600000), NOW, 'en')).toMatch(/^3 hr/)
    expect(relativeAge(ago(2 * 86400000), NOW, 'en')).toMatch(/^2 days/)
  })
  it('is empty for an unknown or future time', () => {
    expect(relativeAge(NaN, NOW, 'en')).toBe('')
    expect(relativeAge(NOW + 10 * 60000, NOW, 'en')).toBe('')
  })
})
