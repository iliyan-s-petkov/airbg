// Defers the timelapse island until the first press of play; the button is built
// with the chrome, so this stands in for it until the chunk has loaded.
export function installLazyTimelapse(map, state, cfg, chrome, load = () => import('./timelapse-island.js')) {
  const ui = chrome.player
  if (!ui) return null

  let real = null
  let pending = null

  ui.ontoggle(async () => {
    if (real || pending) return
    pending = load().then((m) => m.installTimelapse(map, state, cfg, chrome))
    try {
      real = await pending
    } catch (err) {
      console.error('timelapse:', err)
      pending = null
      return
    }
    // The island's own handler is registered too late for this press.
    await real?.toggle()
  })

  return {
    reset: async () => { await real?.reset() },
  }
}
