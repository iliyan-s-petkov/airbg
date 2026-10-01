import { describe, it, expect, vi } from 'vitest'
import { whenFirstPaintReported, FCP_WAIT_MAX_MS } from '../main.js'

// A PerformanceObserver double that lets the test deliver paint entries by hand.
function fakeObserver() {
  const state = { cb: null, disconnected: false, opts: null }
  class Observer {
    static supportedEntryTypes = ['paint']
    constructor(cb) { state.cb = cb }
    observe(opts) { state.opts = opts }
    disconnect() { state.disconnected = true }
  }
  return { Observer, state }
}

const entries = (names) => ({ getEntriesByName: (n) => (names.includes(n) ? [{ name: n }] : []) })

describe('whenFirstPaintReported', () => {
  it('runs on a fresh task when first-contentful-paint is already recorded', () => {
    const callback = vi.fn()
    const timer = vi.fn((fn) => fn())
    const perf = { getEntriesByName: () => [{ name: 'first-contentful-paint' }] }
    whenFirstPaintReported(callback, perf, undefined, timer)
    expect(timer).toHaveBeenCalledWith(expect.any(Function), 0)
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('runs at once when the browser cannot report paint entries', () => {
    const callback = vi.fn()
    whenFirstPaintReported(callback, { getEntriesByName: () => [] }, undefined, vi.fn())
    expect(callback).toHaveBeenCalledTimes(1)
  })

  it('waits for the first-contentful-paint entry, then runs once', () => {
    const callback = vi.fn()
    const timer = vi.fn((fn, ms) => { if (ms === 0) fn() })
    const { Observer, state } = fakeObserver()
    whenFirstPaintReported(callback, { getEntriesByName: () => [] }, Observer, timer, vi.fn())
    expect(state.opts).toEqual({ type: 'paint', buffered: true })
    expect(callback).not.toHaveBeenCalled()

    state.cb(entries(['first-paint']))
    expect(callback).not.toHaveBeenCalled()

    state.cb(entries(['first-contentful-paint']))
    state.cb(entries(['first-contentful-paint']))
    expect(callback).toHaveBeenCalledTimes(1)
    expect(state.disconnected).toBe(true)
  })

  it('gives up waiting after FCP_WAIT_MAX_MS so a hidden tab still mounts', () => {
    const callback = vi.fn()
    const { Observer } = fakeObserver()
    const timers = []
    const timer = vi.fn((fn, ms) => { timers.push([fn, ms]); return timers.length })
    whenFirstPaintReported(callback, { getEntriesByName: () => [] }, Observer, timer, vi.fn())
    const fallback = timers.find(([, ms]) => ms === FCP_WAIT_MAX_MS)
    expect(fallback).toBeTruthy()
    fallback[0]() // fallback fires -> schedules the callback task
    timers.find(([, ms]) => ms === 0)[0]()
    expect(callback).toHaveBeenCalledTimes(1)
  })
})
