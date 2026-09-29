// State the sensor card's parts share: the gauges (SensorPanel) and the chart
// controls (SensorChart) are mounted separately but pick the same metric,
// and the chart's menu opens the panel's "about" sheet.
export function createPanelLink() {
  let metrics = $state([])
  let aboutOpen = $state(false)
  return {
    get metrics() { return metrics },
    set metrics(next) { metrics = next },
    get aboutOpen() { return aboutOpen },
    set aboutOpen(next) { aboutOpen = next },
  }
}
