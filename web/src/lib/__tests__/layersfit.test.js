import { describe, it, expect } from 'vitest'
import { layersMaxHeight } from '../layersfit.js'

describe('layersMaxHeight', () => {
  it('stops at the frame bottom when the frame ends first', () => {
    expect(layersMaxHeight({ panelTop: 100, frameBottom: 300, visibleBottom: 400 })).toBe(192)
  })
  it('stops at the visible viewport when the toolbar hides the frame bottom', () => {
    expect(layersMaxHeight({ panelTop: 100, frameBottom: 400, visibleBottom: 320 })).toBe(212)
  })
  it('never goes below one option row', () => {
    expect(layersMaxHeight({ panelTop: 380, frameBottom: 400, visibleBottom: 400 })).toBe(88)
  })
})
