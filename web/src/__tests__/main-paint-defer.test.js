// @vitest-environment jsdom
//
// init() must not walk the DOM for islands synchronously — the map chunk's
// evaluation is what was measured (#615) delaying paint of the already
// server-rendered LCP text. These tests prove the deferral at the DOM-walk
// boundary (document.querySelectorAll) rather than mocking individual island
// loaders, so they hold regardless of which islands a page has.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('init defers island mounting until after first paint', () => {
  let rafCallbacks

  beforeEach(() => {
    vi.resetModules()
    document.body.innerHTML = ''
    rafCallbacks = []
    // A fake requestAnimationFrame that just records callbacks instead of
    // scheduling them against real frames — the test drives them by hand so
    // it does not depend on real timing.
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((cb) => {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not query for [data-island] elements synchronously on import', async () => {
    const qsa = vi.spyOn(document, 'querySelectorAll')

    await import('../main.js') // runs init() via the module's own top-level guard

    expect(qsa).not.toHaveBeenCalledWith('[data-island]')
    expect(rafCallbacks).toHaveLength(1) // the first (outer) rAF was scheduled
  })

  it('queries for [data-island] elements only after two animation frames have run', async () => {
    const qsa = vi.spyOn(document, 'querySelectorAll')

    await import('../main.js')

    expect(rafCallbacks).toHaveLength(1)
    rafCallbacks[0]() // fire the outer frame -> schedules the inner one
    expect(qsa).not.toHaveBeenCalledWith('[data-island]')
    expect(rafCallbacks).toHaveLength(2)

    rafCallbacks[1]() // fire the inner frame -> islands mount now
    expect(qsa).toHaveBeenCalledWith('[data-island]')
  })
})

// scheduleAfterFirstPaint is exercised directly too, without jsdom's DOM
// involved at all, matching the rest of main.js's pure-logic test style.
import { scheduleAfterFirstPaint } from '../main.js'

describe('scheduleAfterFirstPaint', () => {
  it('does not call the callback synchronously', () => {
    const callback = vi.fn()
    const raf = vi.fn()

    scheduleAfterFirstPaint(callback, raf)

    expect(callback).not.toHaveBeenCalled()
    expect(raf).toHaveBeenCalledTimes(1)
  })

  it('calls the callback only after the raf it was given fires twice', () => {
    const callback = vi.fn()
    const scheduled = []
    const raf = vi.fn((cb) => scheduled.push(cb))

    scheduleAfterFirstPaint(callback, raf)
    expect(scheduled).toHaveLength(1)

    scheduled[0]() // first frame fires -> schedules the second rAF
    expect(callback).not.toHaveBeenCalled()
    expect(scheduled).toHaveLength(2)

    scheduled[1]() // second frame fires -> callback runs
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('falls back to setTimeout when no requestAnimationFrame is given', () => {
    vi.useFakeTimers()
    const callback = vi.fn()

    scheduleAfterFirstPaint(callback, undefined)
    expect(callback).not.toHaveBeenCalled()

    vi.runAllTimers()
    expect(callback).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
