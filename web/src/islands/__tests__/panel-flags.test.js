import { describe, expect, it } from 'vitest'
import { flagCatalogueFrom, flagTextForSensor, normaliseSensor } from '../panel.js'

const catalogue = flagCatalogueFrom({
  tFlagOutOfRange: 'Reports values outside the possible range.',
  tFlagStuck: 'Reading has not changed in a while.',
  tFlagClamped: 'Sensor is saturated.',
})
const labels = { P2: 'PM2.5', temperature: 'Temperature', humidity: 'Humidity' }

describe('flag catalogue', () => {
  it('has a text for clamped', () => {
    expect(catalogue.clamped).toBe('Sensor is saturated.')
  })
})

describe('flagTextForSensor', () => {
  it('names the failed metrics, grouped by flag', () => {
    const sensor = { flag: 'out_of_range', flags: { temperature: 'out_of_range', humidity: 'out_of_range' } }
    expect(flagTextForSensor(sensor, catalogue, labels))
      .toBe('Temperature, Humidity: Reports values outside the possible range.')
  })

  it('says nothing for a healthy station', () => {
    expect(flagTextForSensor({ flag: 'ok', flags: {} }, catalogue, labels)).toBe('')
  })

  it('falls back to the single flag when the payload has no flags column', () => {
    expect(flagTextForSensor({ flag: 'stuck', flags: null }, catalogue, labels))
      .toBe('Reading has not changed in a while.')
  })

  it('falls back to the metric key when it has no label', () => {
    expect(flagTextForSensor({ flag: 'stuck', flags: { noise_LAeq: 'stuck' } }, catalogue, labels))
      .toBe('noise_LAeq: Reading has not changed in a while.')
  })
})

describe('normaliseSensor', () => {
  it('carries the per-metric flags of the whole station', () => {
    const body = { sensors: { id: [1, 2], station: [1, 1], quality: ['ok', 'out_of_range'], flags: [{}, { temperature: 'out_of_range' }], P2: [5, null], temperature: [null, null] } }
    expect(normaliseSensor(body, 1).flags).toEqual({ temperature: 'out_of_range' })
  })

  it('has null flags when the column is absent', () => {
    const body = { sensors: { id: [1], quality: ['ok'], P2: [5] } }
    expect(normaliseSensor(body, 1).flags).toBeNull()
  })
})
