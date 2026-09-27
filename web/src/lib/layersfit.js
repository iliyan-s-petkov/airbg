// Caps the open layers list to what is actually visible: the map frame clips it, and a phone toolbar hides the bottom of the layout viewport.
const GAP = 8
const MIN = 88

export function layersMaxHeight({ panelTop, frameBottom, visibleBottom }) {
  return Math.max(MIN, Math.min(frameBottom, visibleBottom) - panelTop - GAP)
}

export function fitLayers(panel, frame, win = window) {
  const vv = win.visualViewport
  const visibleBottom = vv ? vv.offsetTop + vv.height : win.innerHeight
  const h = layersMaxHeight({
    panelTop: panel.getBoundingClientRect().top,
    frameBottom: frame.getBoundingClientRect().bottom,
    visibleBottom,
  })
  panel.style.maxBlockSize = `${h}px`
}
