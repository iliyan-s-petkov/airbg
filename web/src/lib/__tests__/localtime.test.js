import { describe, it, expect } from 'vitest'
import { formatLocalTime, formatLocalStamp, localizeTimes } from '../localtime.js'

// HH:MM of an instant in the runtime's own zone, built without Intl so the
// expectation does not share code with the formatter under test.
const hm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`

describe('formatLocalTime', () => {
  const iso = '2026-10-01T13:11:00Z'

  it('writes the hour in the runtime zone, 24-hour, with no UTC suffix', () => {
    const out = formatLocalTime(iso, 'en')
    expect(out).toBe(hm(new Date(iso)))
    expect(out).not.toMatch(/UTC|AM|PM/)
  })

  it('returns the input untouched when it is not a date', () => {
    expect(formatLocalTime('not a date', 'en')).toBe('not a date')
  })
})

describe('formatLocalStamp', () => {
  const iso = '2026-10-01T13:11:00Z'

  it('shows only the time when the stamp is on the same local day as now', () => {
    const now = new Date(iso)
    expect(formatLocalStamp(iso, 'en', now)).toBe(hm(now))
  })

  it('keeps a localised date when the stamp is not from today', () => {
    const now = new Date('2026-10-04T13:11:00Z')
    const out = formatLocalStamp(iso, 'en', now)
    expect(out.endsWith(` ${hm(new Date(iso))}`)).toBe(true)
    expect(out.length).toBeGreaterThan(hm(now).length + 1)
    expect(out).not.toContain('UTC')
  })
})

describe('localizeTimes', () => {
  const stamp = (iso, text) => ({ textContent: text, getAttribute: (n) => (n === 'datetime' ? iso : null) })

  it('rewrites each marked <time> from its datetime attribute', () => {
    const iso = '2026-10-01T13:11:00Z'
    const el = stamp(iso, '2026-10-01 13:11 UTC')
    const root = { querySelectorAll: (sel) => (sel === 'time[data-local-time]' ? [el] : []) }
    localizeTimes(root, 'en', new Date(iso))
    expect(el.textContent).toBe(hm(new Date(iso)))
  })

  it('leaves the server text when the datetime is unreadable', () => {
    const el = stamp('garbage', '2026-10-01 13:11 UTC')
    const root = { querySelectorAll: () => [el] }
    localizeTimes(root, 'en', new Date())
    expect(el.textContent).toBe('2026-10-01 13:11 UTC')
  })
})
