// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { createBackToMap } from '../backtomap.js'

// A stub IntersectionObserver: capture the callback so a test can fire it by
// hand, since jsdom has no real intersection geometry to drive.
function stubIO() {
  let cb = null
  const observe = vi.fn()
  function IO(fn) { cb = fn; this.observe = observe; this.disconnect = vi.fn() }
  return { IO, fire: (isIntersecting) => cb([{ isIntersecting }]) }
}

function page() {
  document.body.innerHTML = `
    <div class="map-shell"><div id="map" class="map"></div></div>
    <button type="button" class="back-to-map" aria-label="Back to map"></button>`
  return {
    shell: document.querySelector('.map-shell'),
    btn: document.querySelector('.back-to-map'),
  }
}

function env({ phone = true, reduce = false } = {}) {
  const { IO, fire } = stubIO()
  const win = {
    matchMedia: (q) => ({
      matches: q.includes('hover: none') ? phone : q.includes('reduced-motion') ? reduce : false,
    }),
  }
  return { win, doc: document, IO, fire }
}

describe('createBackToMap', () => {
  it('does nothing when the button is not on the page', () => {
    document.body.innerHTML = '<div class="map-shell"></div>'
    const e = env()
    expect(createBackToMap({ doc: e.doc, win: e.win, IO: e.IO })).toBeNull()
  })

  it('does nothing when there is no map-shell', () => {
    document.body.innerHTML = '<button class="back-to-map"></button>'
    const e = env()
    expect(createBackToMap({ doc: e.doc, win: e.win, IO: e.IO })).toBeNull()
  })

  it('starts hidden, shows once the map scrolls fully out of view', () => {
    const { btn } = page()
    const e = env()
    createBackToMap({ doc: e.doc, win: e.win, IO: e.IO })
    expect(btn.classList.contains('back-to-map--visible')).toBe(false)
    e.fire(false)
    expect(btn.classList.contains('back-to-map--visible')).toBe(true)
  })

  it('hides again once the map scrolls back into view', () => {
    const { btn } = page()
    const e = env()
    createBackToMap({ doc: e.doc, win: e.win, IO: e.IO })
    e.fire(false)
    e.fire(true)
    expect(btn.classList.contains('back-to-map--visible')).toBe(false)
  })

  it('stays hidden on desktop (hover: hover) even when the map is off-screen', () => {
    const { btn } = page()
    const e = env({ phone: false })
    createBackToMap({ doc: e.doc, win: e.win, IO: e.IO })
    e.fire(false)
    expect(btn.classList.contains('back-to-map--visible')).toBe(false)
  })

  it('smooth-scrolls the shell into view and focuses it on click', () => {
    const { btn, shell } = page()
    shell.scrollIntoView = vi.fn()
    shell.focus = vi.fn()
    const e = env()
    createBackToMap({ doc: e.doc, win: e.win, IO: e.IO })
    btn.click()
    expect(shell.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' })
    expect(shell.focus).toHaveBeenCalledWith({ preventScroll: true })
    expect(shell.getAttribute('tabindex')).toBe('-1')
  })

  it('jumps without animation under prefers-reduced-motion', () => {
    const { btn, shell } = page()
    shell.scrollIntoView = vi.fn()
    const e = env({ reduce: true })
    createBackToMap({ doc: e.doc, win: e.win, IO: e.IO })
    btn.click()
    expect(shell.scrollIntoView).toHaveBeenCalledWith({ behavior: 'auto', block: 'start' })
  })

  it('does not add a second tabindex if the shell already has one', () => {
    const { btn, shell } = page()
    shell.setAttribute('tabindex', '0')
    shell.scrollIntoView = vi.fn()
    const e = env()
    createBackToMap({ doc: e.doc, win: e.win, IO: e.IO })
    btn.click()
    expect(shell.getAttribute('tabindex')).toBe('0')
  })
})
