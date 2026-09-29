// Maps the visitors payload to uPlot's [xs, ys]. Only `uniques` is plotted:
// requests and page views are not what the page claims to show, and the API
// deliberately carries no total.
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/

// Null means "nothing to draw", so the caller shows its own empty line. Fewer
// than two usable days is empty for the same reason as chart.js: one point is
// a number, not a trend.
export function visitorSeries(body) {
  const rows = Array.isArray(body?.days) ? body.days : []
  const points = []
  for (const row of rows) {
    if (typeof row?.day !== 'string' || !DAY_RE.test(row.day)) continue
    if (!Number.isFinite(row.uniques)) continue
    // Epoch seconds, as uPlot's time scale expects (see series.js).
    points.push([Date.parse(`${row.day}T00:00:00Z`) / 1000, row.uniques])
  }
  if (points.length < 2) return null
  points.sort((a, b) => a[0] - b[0])
  return [points.map((p) => p[0]), points.map((p) => p[1])]
}
