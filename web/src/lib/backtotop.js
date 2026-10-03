// Floating back-to-top button, shown once the map (or, on a map-less page, the first screen) has scrolled out through the top.
export function createBackToTop({ doc = document, win = window, IO = win.IntersectionObserver } = {}) {
  const btn = doc.querySelector('.back-to-top')
  const target = doc.querySelector('.map-shell') ?? doc.querySelector('.back-to-top-sentinel')
  if (!btn || !target || !IO) return null

  // Past the target means it left above the viewport; a target still below the fold must not show the button.
  const observer = new IO(([entry]) => {
    btn.classList.toggle('back-to-top--visible', !entry.isIntersecting && entry.boundingClientRect.bottom <= 0)
  }, { threshold: 0 })
  observer.observe(target)

  btn.addEventListener('click', () => {
    const reduce = win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    win.scrollTo({ top: 0, behavior: reduce ? 'instant' : 'smooth' })
    // The page heading is the first thing a screen reader should land on; preventScroll keeps the smooth scroll going.
    const heading = doc.querySelector('main h1')
    if (heading) {
      if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    }
  })

  return { observer }
}
