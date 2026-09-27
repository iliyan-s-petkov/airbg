// Drives lib/panelscroll.js from the shown sensor id; a rune module because islands/panel.js is plain .js.
import { tick, untrack } from 'svelte'

// shownId: the open sensor once the registry can render it, else null.
// initialId: the #sensor= the page loaded with; its first showing is not a user tap.
export function watchPanelScroll({ shownId, initialId, scroll, onReturn = () => {} }) {
  let prev = null
  let first = initialId != null
  return $effect.root(() => {
    $effect(() => {
      const id = shownId()
      untrack(() => {
        if (id === prev) return
        const was = prev
        prev = id
        if (id === null) {
          if (scroll.closed()) onReturn()
          return
        }
        const initial = first && was === null && id === initialId
        first = false
        // After the panel's own render, so the section exists and has its final position.
        tick().then(() => { if (prev === id) scroll.opened({ initial }) })
      })
    })
  })
}
