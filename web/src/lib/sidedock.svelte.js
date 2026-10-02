// The open sensor's title and gauges docked over the right of the map on wide screens.
// The panel's own .gauges node is moved in and put back, the same move-not-duplicate idiom as sensorsheet.
import { tick } from 'svelte'

const WIDE = '(min-width: 1024px)'
const TITLE_ID = 'map-dock-title'

export function createSideDock(frame, { closeLabel = '', moreLabel = '' } = {}) {
  const doc = frame.ownerDocument
  const win = doc.defaultView
  const shell = frame.closest('.map-shell')
  // The embed page never docks: its card is not under the map either.
  const enabled = !doc.body.classList.contains('embed')
  const mq = win?.matchMedia?.(WIDE) ?? null
  let full = false
  let gauges = null
  let marker = null
  let returnTo = null
  let onClose = () => {}

  const el = doc.createElement('div')
  el.className = 'map-dock'
  el.setAttribute('role', 'group')
  el.setAttribute('aria-labelledby', TITLE_ID)
  el.tabIndex = -1

  const head = doc.createElement('div')
  head.className = 'map-dock__head'
  const title = doc.createElement('h2')
  title.id = TITLE_ID
  title.className = 'map-dock__title'
  const close = doc.createElement('button')
  close.type = 'button'
  close.className = 'map-dock__close'
  close.setAttribute('aria-label', closeLabel)
  close.title = closeLabel
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'map-dock__close-ico')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('aria-hidden', 'true')
  const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path')
  path.setAttribute('d', 'M3.5 3.5l9 9M12.5 3.5l-9 9')
  path.setAttribute('fill', 'none')
  path.setAttribute('stroke', 'currentColor')
  path.setAttribute('stroke-width', '1.5')
  svg.appendChild(path)
  close.appendChild(svg)
  head.append(title, close)
  el.appendChild(head)

  const body = doc.createElement('div')
  body.className = 'map-dock__body'
  el.appendChild(body)

  // A button, not an <a href="#…">: a fragment link would rewrite the hash the view state lives in.
  const more = doc.createElement('button')
  more.type = 'button'
  more.className = 'map-dock__more'
  more.textContent = moreLabel
  if (moreLabel) el.appendChild(more)

  const panel = () => doc.querySelector('[data-island="panel"] .sensor-panel')
  const mounted = () => el.parentNode === frame

  function restoreGauges() {
    if (marker && gauges) marker.replaceWith(gauges)
    marker = null
    gauges = null
  }

  function unmount() {
    if (!mounted()) return
    restoreGauges()
    el.remove()
    shell?.classList.remove('map-shell--docked')
    const back = returnTo
    returnTo = null
    if (back?.isConnected && back !== doc.body && typeof back.focus === 'function') back.focus({ preventScroll: true })
  }

  // Idempotent: reads the panel as it is now and mounts, updates or unmounts.
  function sync() {
    const p = panel()
    // Gauges already moved out of this panel are its own, not a panel without them.
    const own = gauges && body.contains(gauges) && p?.contains(marker) ? gauges : null
    const next = p?.querySelector('.gauges') ?? own
    if (!enabled || full || !mq?.matches || !p || !next) {
      unmount()
      return
    }
    title.textContent = p.querySelector('h2')?.textContent ?? ''
    if (next !== gauges) {
      restoreGauges()
      marker = doc.createComment('gauges')
      next.before(marker)
      gauges = next
      body.appendChild(next)
    }
    if (!mounted()) {
      returnTo = doc.activeElement
      frame.appendChild(el)
      shell?.classList.add('map-shell--docked')
      el.focus({ preventScroll: true })
    }
  }

  function dismiss() {
    unmount()
    onClose()
  }

  close.addEventListener('click', dismiss)
  more.addEventListener('click', () => panel()?.scrollIntoView({ block: 'start', behavior: 'smooth' }))
  mq?.addEventListener?.('change', sync)

  // Capture phase, like the sheet, so a faux-fullscreen Escape handler never sees a dock Escape.
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !mounted()) return
    e.stopPropagation()
    e.preventDefault()
    dismiss()
  }, true)

  return {
    el,
    sync,
    setFull(on) {
      full = on
      sync()
    },
    // Re-syncs after the panel has rendered the sensor the view state names.
    follow(vs, findSensor) {
      onClose = () => vs.closeSensor()
      return $effect.root(() => {
        $effect(() => {
          findSensor(vs.sensorId)
          tick().then(sync)
        })
      })
    },
  }
}
