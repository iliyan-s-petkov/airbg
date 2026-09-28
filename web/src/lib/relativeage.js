// "4 min. ago" in the page's language, from a timestamp and a clock.
// Empty when the time is unknown or in the future by more than a minute.
export function relativeAge(then, now, locale) {
  if (!Number.isFinite(then) || !Number.isFinite(now)) return ''
  const seconds = Math.round((now - then) / 1000)
  if (seconds < -60) return ''
  const minutes = Math.max(0, Math.round(seconds / 60))
  const units = [['day', 1440], ['hour', 60], ['minute', 1]]
  const [unit, size] = units.find(([, m]) => minutes >= m) ?? units[2]
  const fmt = new Intl.RelativeTimeFormat(locale, { numeric: 'always', style: 'short' })
  return fmt.format(-Math.floor(minutes / size), unit)
}
