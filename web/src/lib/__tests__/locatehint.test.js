// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest'
import { LOCATE_HINT_KEY, HINT_MS, shouldShowLocateHint, installLocateHint } from '../locatehint.js'
import { LAST_VIEW_KEY } from '../lastview.js'

const memory = (initial = {}) => {
  const store = { ...initial }
  return {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = v },
    has: (k) => k in store,
  }
}

const home = { rememberView: true }
const none = { hash: '', search: '' }

afterEach(() => {
  vi.useRealTimers()
  document.body.replaceChildren()
})

describe('LOCATE_HINT_KEY', () => {
  it('uses the kanarche: prefix', () => {
    expect(LOCATE_HINT_KEY).toBe('kanarche:locate-hint-seen')
  })
})

describe('shouldShowLocateHint', () => {
  it('shows on a first visit to the home map', () => {
    expect(shouldShowLocateHint(home, { ...none, storage: memory() })).toBe(true)
  })

  it('never shows off the home map', () => {
    expect(shouldShowLocateHint({ rememberView: false }, { ...none, storage: memory() })).toBe(false)
  })

  it('stays away once seen', () => {
    expect(shouldShowLocateHint(home, { ...none, storage: memory({ [LOCATE_HINT_KEY]: '1' }) })).toBe(false)
  })

  it('stays away for a visitor with a saved view', () => {
    const saved = JSON.stringify({ lat: 42.7, lng: 25.4, zoom: 9 })
    expect(shouldShowLocateHint(home, { ...none, storage: memory({ [LAST_VIEW_KEY]: saved }) })).toBe(false)
  })

  it('stays away for an explicit URL view', () => {
    expect(shouldShowLocateHint(home, { hash: '#sensor=7', search: '', storage: memory() })).toBe(false)
    expect(shouldShowLocateHint(home, { hash: '', search: '?lat=42&lng=25', storage: memory() })).toBe(false)
  })

  it('stays away when storage is unavailable, since it could never be remembered', () => {
    expect(shouldShowLocateHint(home, { ...none, storage: null })).toBe(false)
  })
})

describe('installLocateHint', () => {
  const setup = (over = {}) => {
    const frame = document.createElement('div')
    document.body.append(frame)
    const locate = document.createElement('button')
    frame.append(locate)
    const handlers = {}
    const map = { on: vi.fn((ev, fn) => { handlers[ev] = fn }), off: vi.fn() }
    const storage = over.storage ?? memory()
    const onActivate = vi.fn()
    const hint = installLocateHint(map, locate, home, {
      ...none, text: 'See the air near you', onActivate, storage, ...over,
    })
    return { frame, locate, map, handlers, storage, onActivate, hint }
  }
  const shown = (frame) => frame.querySelector('.map-locate-hint')

  it('renders a status callout with the text and remembers it was shown', () => {
    const { frame, storage } = setup()
    const el = shown(frame)
    expect(el.getAttribute('role')).toBe('status')
    expect(el.textContent).toBe('See the air near you')
    expect(storage.getItem(LOCATE_HINT_KEY)).toBe('1')
  })

  it('renders nothing when it should not show', () => {
    const { frame, hint } = setup({ storage: memory({ [LOCATE_HINT_KEY]: '1' }) })
    expect(hint).toBeNull()
    expect(shown(frame)).toBeNull()
  })

  it('renders nothing when remembering it throws', () => {
    const storage = { getItem: () => null, setItem() { throw new Error('full') } }
    const { frame } = setup({ storage })
    expect(shown(frame)).toBeNull()
  })

  it('clicking the bubble locates and closes it', () => {
    const { frame, onActivate } = setup()
    frame.querySelector('.map-locate-hint button').click()
    expect(onActivate).toHaveBeenCalledOnce()
    expect(shown(frame)).toBeNull()
  })

  it('goes on the visitor\'s own move, not a programmatic one', () => {
    const { frame, handlers } = setup()
    handlers.movestart({})
    expect(shown(frame)).not.toBeNull()
    handlers.movestart({ originalEvent: new Event('wheel') })
    expect(shown(frame)).toBeNull()
  })

  it('goes on a map click', () => {
    const { frame, handlers } = setup()
    handlers.click({})
    expect(shown(frame)).toBeNull()
  })

  it('goes on a click of the locate button', () => {
    const { frame, locate } = setup()
    locate.click()
    expect(shown(frame)).toBeNull()
  })

  it('goes after eight seconds', () => {
    vi.useFakeTimers()
    const { frame } = setup()
    vi.advanceTimersByTime(HINT_MS - 1)
    expect(shown(frame)).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(shown(frame)).toBeNull()
    expect(HINT_MS).toBe(8000)
  })

  it('lets go of the map listeners when it goes', () => {
    const { map, handlers } = setup()
    handlers.click({})
    expect(map.off).toHaveBeenCalledWith('click', handlers.click)
    expect(map.off).toHaveBeenCalledWith('movestart', handlers.movestart)
  })
})
