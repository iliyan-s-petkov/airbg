// @vitest-environment jsdom
// The desktop side dock: mountChrome, the real panel island and the shared view state,
// wired as islands/map.js wires them, with a matchMedia whose width the test controls.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('uplot', () => ({ default: vi.fn(function () { this.setSize = vi.fn() }) }))

import { tick } from 'svelte'
import { mountChrome } from '../chrome.js'
import { readConfig } from '../mapconfig.js'
import { mount as mountPanel } from '../../islands/panel.js'
import { setSensors, findSensor } from '../sensors.svelte.js'
import { getViewState, resetViewStateForTests } from '../viewstate.svelte.js'

const BODY = {
  sensors: {
    id: [101, 102], quality: ['ok', 'ok'], station: [101, 102],
    measures: [['P1', 'P2', 'temperature', 'humidity'], ['P1', 'P2', 'temperature', 'humidity']],
    P1: [31, 12], P2: [18, 7], temperature: [21, 19], humidity: [55, 60],
  },
}

// matchMedia that answers the dock's width query from `wide` and lets a test flip it.
function stubViewport(wide) {
  const listeners = new Set()
  const state = { wide }
  vi.stubGlobal('matchMedia', (q) => ({
    get matches() { return q.includes('min-width: 1024px') ? state.wide : false },
    media: q,
    addEventListener: (_t, fn) => { if (q.includes('min-width: 1024px')) listeners.add(fn) },
    removeEventListener: (_t, fn) => listeners.delete(fn),
  }))
  state.set = (on) => { state.wide = on; listeners.forEach((fn) => fn({ matches: on })) }
  return state
}

function page() {
  const shell = document.createElement('div')
  shell.className = 'map-shell'
  const el = document.createElement('div')
  el.className = 'map'
  Object.assign(el.dataset, {
    metric: 'P2', metrics: 'P1,P2,temperature,humidity',
    tClose: 'Close', tSheetHistory: 'Full history below',
  })
  const canvas = document.createElement('canvas')
  canvas.tabIndex = 0
  el.appendChild(canvas)
  shell.appendChild(el)

  const host = document.createElement('div')
  host.dataset.island = 'panel'
  Object.assign(host.dataset, {
    metrics: 'P1,P2,temperature,humidity',
    metricLabels: 'PM10,PM2.5,Temperature,Humidity',
    metric: 'P2', period: '24h', tTitle: 'Sensor', tClose: 'Close', tNoValue: 'no data',
  })
  document.body.append(shell, host)

  const chrome = mountChrome(el, readConfig(el))
  mountPanel(host)
  const vs = getViewState({ metrics: ['P1', 'P2', 'temperature', 'humidity'], defaultMetric: 'P2' })
  const stop = chrome.dock.follow(vs, findSensor)
  const stopSheet = chrome.sheet.follow(vs, findSensor)
  return { shell, el, host, canvas, vs, stop: () => { stop(); stopSheet() }, full: el.querySelector('.map__full') }
}

const settle = async () => { await tick(); await tick(); await Promise.resolve() }

describe('the desktop side dock', () => {
  let ctx
  let vp
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    Element.prototype.scrollIntoView = vi.fn()
    resetViewStateForTests()
    history.replaceState(null, '', '/')
    setSensors(BODY)
  })
  afterEach(() => {
    ctx?.stop()
    resetViewStateForTests()
    setSensors(null)
    document.body.replaceChildren()
    document.body.className = ''
    vi.unstubAllGlobals()
  })

  it('docks the open sensor s title and own gauges when the viewport is wide', async () => {
    vp = stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()

    const dock = ctx.el.querySelector('.map-dock')
    expect(dock, 'no dock inside the map frame').toBeTruthy()
    expect(dock.querySelector('h2').textContent).toBe('Sensor 101')
    expect(dock.querySelectorAll('.gauge')).toHaveLength(4)
    expect(ctx.host.querySelector('.sensor-panel .gauges'), 'the gauges were copied, not moved').toBeNull()
    expect(ctx.shell.classList.contains('map-shell--docked')).toBe(true)
  })

  it('does not dock on a narrow viewport', async () => {
    vp = stubViewport(false)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    expect(document.querySelector('.map-dock')).toBeNull()
    expect(ctx.host.querySelector('.sensor-panel .gauges')).toBeTruthy()
    expect(ctx.shell.classList.contains('map-shell--docked')).toBe(false)
  })

  it('returns the gauges to their original place when the viewport narrows, and docks again when it widens', async () => {
    vp = stubViewport(false)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    const panel = ctx.host.querySelector('.sensor-panel')
    const gauges = panel.querySelector('.gauges')
    const before = gauges.previousElementSibling

    vp.set(true)
    await settle()
    expect(ctx.el.querySelector('.map-dock .gauges')).toBe(gauges)

    vp.set(false)
    await settle()
    expect(ctx.el.querySelector('.map-dock')).toBeNull()
    expect(panel.querySelector('.gauges')).toBe(gauges)
    expect(gauges.previousElementSibling).toBe(before)
    expect(document.querySelectorAll('.gauges')).toHaveLength(1)
    expect([...panel.childNodes].some((n) => n.nodeType === Node.COMMENT_NODE && n.data === 'gauges')).toBe(false)
    expect(ctx.shell.classList.contains('map-shell--docked')).toBe(false)

    vp.set(true)
    await settle()
    expect(ctx.el.querySelectorAll('.map-dock')).toHaveLength(1)
    expect(document.querySelectorAll('.gauges')).toHaveLength(1)
  })

  it('swaps the title in place for another sensor and keeps one dock', async () => {
    vp = stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    ctx.vs.openSensor(102)
    await settle()
    expect(ctx.el.querySelectorAll('.map-dock')).toHaveLength(1)
    expect(ctx.el.querySelector('.map-dock h2').textContent).toBe('Sensor 102')
    expect(ctx.el.querySelectorAll('.map-dock .gauge')).toHaveLength(4)
    expect(document.querySelectorAll('.gauges')).toHaveLength(1)
  })

  it('goes away when the sensor closes', async () => {
    vp = stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    ctx.vs.closeSensor()
    await settle()
    expect(ctx.el.querySelector('.map-dock')).toBeNull()
    expect(ctx.shell.classList.contains('map-shell--docked')).toBe(false)
  })

  it('stands down while fullscreen and comes back on exit with one set of gauges', async () => {
    vp = stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    ctx.full.click()
    await settle()
    expect(ctx.el.querySelector('.map-dock')).toBeNull()
    expect(ctx.el.querySelector('.map-sensor-sheet .gauges')).toBeTruthy()
    expect(document.querySelectorAll('.gauges')).toHaveLength(1)

    ctx.full.click()
    await settle()
    expect(ctx.el.querySelector('.map-sensor-sheet')).toBeNull()
    expect(ctx.el.querySelector('.map-dock .gauges')).toBeTruthy()
    expect(document.querySelectorAll('.gauges')).toHaveLength(1)
  })

  it('the close button clears the open sensor', async () => {
    vp = stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    const close = ctx.el.querySelector('.map-dock button[aria-label="Close"]')
    expect(close, 'no named close button').toBeTruthy()
    close.click()
    await settle()
    expect(ctx.vs.sensorId).toBeNull()
    expect(ctx.el.querySelector('.map-dock')).toBeNull()
  })

  it('Escape closes the dock and returns focus to the map', async () => {
    vp = stubViewport(true)
    ctx = page()
    ctx.canvas.focus()
    ctx.vs.openSensor(101)
    await settle()
    expect(ctx.el.querySelector('.map-dock').contains(document.activeElement), 'focus did not move into the dock').toBe(true)
    document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(ctx.vs.sensorId).toBeNull()
    expect(document.activeElement).toBe(ctx.canvas)
  })

  it('the more link scrolls the card under the map into view', async () => {
    vp = stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    const more = ctx.el.querySelector('.map-dock__more')
    expect(more.textContent).toBe('Full history below')
    more.click()
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    expect(ctx.vs.sensorId).toBe(101)
  })
})
