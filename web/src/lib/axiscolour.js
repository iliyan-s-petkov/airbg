// WCAG contrast for the sensor chart's axes. A metric's line colour is
// server config (frontend.chart_*_colour, see islands/chart.js, islands/panel.js)
// picked once for both themes, so #2563eb reads 3.6:1 on dark's #161616. This
// lightens (or darkens) it just enough to clear a contrast floor while keeping
// its hue, rather than replacing it with a theme token.

function parseColour(value) {
  if (typeof value !== 'string') return null
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (hex) {
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  }
  const rgb = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i)
  return rgb ? rgb.slice(1, 4).map(Number) : null
}

function relativeLuminance([r, g, b]) {
  const c = [r, g, b].map((v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}

export function contrastRatio(a, b) {
  const [ca, cb] = [parseColour(a), parseColour(b)]
  if (!ca || !cb) return null
  const [la, lb] = [relativeLuminance(ca), relativeLuminance(cb)].sort((x, y) => y - x)
  return (la + 0.05) / (lb + 0.05)
}

function mix(from, to, t) {
  return from.map((v, i) => Math.round(v + (to[i] - v) * t))
}

// Nudges `colour` toward white or black — whichever side of `bg` it sits on —
// until it clears `min` contrast against `bg`. Returns `colour` unchanged
// (as an rgb() string) once resolvable colours already clear it, or if either
// is unparsable.
export function legibleStroke(colour, bg, min = 4.5) {
  const from = parseColour(colour)
  const against = parseColour(bg)
  if (!from || !against) return colour
  if (contrastRatio(colour, bg) >= min) return colour
  const target = relativeLuminance(against) < 0.5 ? [255, 255, 255] : [0, 0, 0]
  let rgb = from
  for (let t = 0; t <= 1; t += 0.02) {
    rgb = mix(from, target, t)
    if (contrastRatio(`rgb(${rgb.join(',')})`, bg) >= min) break
  }
  return `rgb(${rgb.join(', ')})`
}
