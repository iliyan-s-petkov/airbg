import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { installPanelPadding } from '../panelpadding.js'
import { setSensors } from '../sensors.svelte.js'

// A camera double that records padding and projects a sensor to a chosen screen y.
function fakeMap(y, canvasHeight = 600) {
  return {
    setPadding: vi.fn(),
    easeTo: vi.fn(),
    project: vi.fn(() => ({ x: 100, y })),
    getCanvas: () => ({ clientHeight: canvasHeight }),
  }
}

function fakeDock() {
  let fn = () => {}
  return { onLayout: (f) => { fn = f; return () => {} }, emit: (h) => fn(h) }
}

const BODY = {
  sensors: {
    id: [101], quality: ['ok'], station: [101], lon: [23.3], lat: [42.7],
    measures: [['P2']], P2: [10],
  },
}

describe('panel padding', () => {
  beforeEach(() => setSensors(BODY))
  afterEach(() => setSensors(null))

  it('pads the camera by the height the panel covers and clears it on close', () => {
    const map = fakeMap(100)
    const dock = fakeDock()
    installPanelPadding(map, dock, { sensorId: 101 })
    dock.emit(280)
    expect(map.setPadding).toHaveBeenLastCalledWith({ bottom: 280, top: 0, left: 0, right: 0 })
    dock.emit(0)
    expect(map.setPadding).toHaveBeenLastCalledWith({ bottom: 0, top: 0, left: 0, right: 0 })
  })

  it('leaves the camera alone when the open sensor is already above the panel', () => {
    const map = fakeMap(100)
    const dock = fakeDock()
    installPanelPadding(map, dock, { sensorId: 101 })
    dock.emit(280)
    expect(map.easeTo).not.toHaveBeenCalled()
  })

  it('flies a sensor the panel would cover to the centre of the visible part', () => {
    const map = fakeMap(560)
    const dock = fakeDock()
    installPanelPadding(map, dock, { sensorId: 101 })
    dock.emit(280)
    expect(map.easeTo).toHaveBeenCalledTimes(1)
    expect(map.easeTo.mock.calls[0][0].center).toEqual([23.3, 42.7])
    expect(map.easeTo.mock.calls[0][0].padding.bottom).toBe(280)
  })

  it('does not re-pad for a layout report with the same height', () => {
    const map = fakeMap(100)
    const dock = fakeDock()
    installPanelPadding(map, dock, { sensorId: 101 })
    dock.emit(280)
    dock.emit(280)
    expect(map.setPadding).toHaveBeenCalledTimes(1)
  })
})
