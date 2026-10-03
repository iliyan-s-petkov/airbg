// @vitest-environment jsdom
// One star per open card: it is moved into the dock and the fullscreen sheet and put back, never copied.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('uplot', () => ({ default: vi.fn(function () { this.setSize = vi.fn() }) }))

import { tick } from 'svelte'
import { mountChrome } from '../chrome.js'
import { readConfig } from '../mapconfig.js'
import { mount as mountPanel } from '../../islands/panel.js'
import { setSensors, findSensor } from '../sensors.svelte.js'
import { getViewState, resetViewStateForTests } from '../viewstate.svelte.js'
import { FAVOURITE_KEY } from '../favourite.js'
import { resetFavouriteForTests } from '../favourite.svelte.js'

const BODY = {
  sensors: {
    id: [101, 102], quality: ['ok', 'ok'], station: [101, 102],
    measures: [['P1', 'P2', 'temperature', 'humidity'], ['P1', 'P2', 'temperature', 'humidity']],
    P1: [31, 12], P2: [18, 7], temperature: [21, 19], humidity: [55, 60],
  },
}

// Node's own localStorage global shadows jsdom's and has no working clear() here; a plain stub is enough.
function stubStorage() {
  const m = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: (k) => { m.delete(k) },
    clear: () => m.clear(),
  })
}

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

function page({ embed = false } = {}) {
  if (embed) document.body.classList.add('embed')
  const shell = document.createElement('div')
  shell.className = 'map-shell'
  const el = document.createElement('div')
  el.className = 'map'
  Object.assign(el.dataset, { metric: 'P2', metrics: 'P1,P2,temperature,humidity', tClose: 'Close', tSheetHistory: 'Full history below' })
  const canvas = document.createElement('canvas')
  canvas.tabIndex = 0
  el.appendChild(canvas)
  shell.appendChild(el)
  const host = document.createElement('div')
  host.dataset.island = 'panel'
  Object.assign(host.dataset, {
    metrics: 'P1,P2,temperature,humidity', metricLabels: 'PM10,PM2.5,Temperature,Humidity',
    metric: 'P2', period: '24h', tTitle: 'Sensor', tClose: 'Close', tNoValue: 'no data',
    tFavSave: 'Save as my sensor', tFavRemove: 'Remove my sensor',
  })
  document.body.append(shell, host)
  const chrome = mountChrome(el, readConfig(el))
  mountPanel(host)
  const vs = getViewState({ metrics: ['P1', 'P2', 'temperature', 'humidity'], defaultMetric: 'P2' })
  const stop = chrome.dock.follow(vs, findSensor)
  const stopSheet = chrome.sheet.follow(vs, findSensor)
  return { shell, el, host, vs, chrome, stop: () => { stop(); stopSheet() }, full: el.querySelector('.map__full') }
}

const settle = async () => { await tick(); await tick(); await Promise.resolve() }
const stars = () => document.querySelectorAll('button.panel-star')

describe('the favourite star', () => {
  let ctx
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})))
    Element.prototype.scrollIntoView = vi.fn()
    resetViewStateForTests()
    resetFavouriteForTests()
    stubStorage()
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

  it('is in the card header below the map, and only once', async () => {
    stubViewport(false)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    expect(stars()).toHaveLength(1)
    expect(ctx.host.querySelector('header .panel-actions .panel-star')).toBeTruthy()
  })

  it('toggles and stores only the id', async () => {
    stubViewport(false)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    const star = stars()[0]
    star.click()
    await settle()
    expect(localStorage.getItem(FAVOURITE_KEY)).toBe('101')
    expect(stars()[0].getAttribute('aria-pressed')).toBe('true')
    expect(stars()[0].getAttribute('aria-label')).toBe('Remove my sensor')
    stars()[0].click()
    await settle()
    expect(localStorage.getItem(FAVOURITE_KEY)).toBeNull()
    expect(stars()[0].getAttribute('aria-pressed')).toBe('false')
  })

  it('shows pressed only on the starred sensor', async () => {
    localStorage.setItem(FAVOURITE_KEY, '101')
    stubViewport(false)
    ctx = page()
    ctx.vs.openSensor(102)
    await settle()
    expect(stars()[0].getAttribute('aria-pressed')).toBe('false')
    ctx.vs.openSensor(101)
    await settle()
    expect(stars()[0].getAttribute('aria-pressed')).toBe('true')
  })

  it('rides into the dock beside its close button, one star, and works there', async () => {
    stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    expect(stars()).toHaveLength(1)
    const dock = ctx.el.querySelector('.map-dock')
    expect(dock.querySelector('.map-dock__head .panel-star')).toBeTruthy()
    expect(ctx.host.querySelector('.panel-star')).toBeNull()
    dock.querySelector('.panel-star').click()
    await settle()
    expect(localStorage.getItem(FAVOURITE_KEY)).toBe('101')
    expect(stars()).toHaveLength(1)
  })

  it('goes back to the panel header when the dock stands down', async () => {
    const vp = stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    vp.set(false)
    await settle()
    expect(ctx.el.querySelector('.map-dock')).toBeNull()
    expect(stars()).toHaveLength(1)
    expect(ctx.host.querySelector('header .panel-actions .panel-star')).toBeTruthy()
    expect([...ctx.host.querySelectorAll('.sensor-panel *')].length).toBeGreaterThan(0)
    const nodes = [];
    const walker = document.createTreeWalker(ctx.host, NodeFilter.SHOW_COMMENT)
    while (walker.nextNode()) nodes.push(walker.currentNode.data)
    expect(nodes).not.toContain('star')
  })

  it('swaps with the sensor in the dock without a second star', async () => {
    stubViewport(true)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    ctx.vs.openSensor(102)
    await settle()
    expect(stars()).toHaveLength(1)
    expect(ctx.el.querySelector('.map-dock .panel-star')).toBeTruthy()
  })

  it('rides into the fullscreen sheet, one star', async () => {
    stubViewport(false)
    ctx = page()
    ctx.vs.openSensor(101)
    await settle()
    ctx.full.click()
    await settle()
    const sheet = ctx.el.querySelector('.map-sensor-sheet')
    expect(sheet).toBeTruthy()
    expect(sheet.querySelector('.map-sensor-sheet__head .panel-star')).toBeTruthy()
    expect(stars()).toHaveLength(1)
    ctx.full.click()
    await settle()
    expect(stars()).toHaveLength(1)
    expect(ctx.host.querySelector('header .panel-actions .panel-star')).toBeTruthy()
  })

  it('is absent from the embed', async () => {
    stubViewport(false)
    ctx = page({ embed: true })
    ctx.vs.openSensor(101)
    await settle()
    expect(stars()).toHaveLength(0)
  })
})
