// Local-time formatting shared by the wind note and the footer snapshot time.
// Always the runtime's own zone, 24-hour, in the page language.

const parse = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d
}

export function formatLocalTime(iso, lang = 'bg') {
  const d = parse(iso)
  if (!d) return iso
  return new Intl.DateTimeFormat(lang, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d)
}

// Time alone for a stamp from today; a localised date ahead of it otherwise.
export function formatLocalStamp(iso, lang = 'bg', now = new Date()) {
  const d = parse(iso)
  if (!d) return iso
  const time = formatLocalTime(iso, lang)
  if (d.toDateString() === now.toDateString()) return time
  const date = new Intl.DateTimeFormat(lang, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  return `${date} ${time}`
}

// Rewrites each <time data-local-time> from its datetime attribute. The server's
// UTC text stays where the datetime is unreadable.
export function localizeTimes(root, lang = 'bg', now = new Date()) {
  for (const el of root.querySelectorAll('time[data-local-time]')) {
    const iso = el.getAttribute('datetime')
    if (!parse(iso)) continue
    el.textContent = formatLocalStamp(iso, lang, now)
  }
}
