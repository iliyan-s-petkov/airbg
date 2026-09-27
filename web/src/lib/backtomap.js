// Phone-only "back to map" button (#612), shown while .map-shell is fully off-screen.
// Desktop and fullscreen hiding live in app.css.
export function createBackToMap({ doc = document, win = window, IO = win.IntersectionObserver } = {}) {
  const btn = doc.querySelector('.back-to-map')
  const shell = doc.querySelector('.map-shell')
  if (!btn || !shell || !IO) return null

  const mq = (q) => win.matchMedia?.(q).matches ?? false

  const paint = (offScreen) => btn.classList.toggle('back-to-map--visible', offScreen && mq('(hover: none)'))

  const observer = new IO(([entry]) => paint(!entry.isIntersecting), { threshold: 0 })
  observer.observe(shell)

  btn.addEventListener('click', () => {
    const reduce = mq('(prefers-reduced-motion: reduce)')
    shell.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    // Same focus target as the sensor panel's close; the bare shell until the map loads.
    const target = shell.querySelector('.maplibregl-canvas') ?? shell
    if (target === shell && !shell.hasAttribute('tabindex')) shell.setAttribute('tabindex', '-1')
    target.focus?.({ preventScroll: true })
  })

  return { observer }
}
