// Phone-only "back to map" button (OpenProject #612): fades in once
// .map-shell has scrolled fully out of view and returns the reader to it.
// Fullscreen/faux-full hiding is CSS's job (`.map-shell:has(...) ~
// .back-to-map` in app.css), same as the pull tab's own fullscreen rule; this
// module only tracks intersection and hover capability.
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
    if (!shell.hasAttribute('tabindex')) shell.setAttribute('tabindex', '-1')
    shell.focus?.({ preventScroll: true })
  })

  return { observer }
}
