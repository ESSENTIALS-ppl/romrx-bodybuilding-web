// Local calendar helpers. toISOString() is UTC, so after 8 PM ET it already reads tomorrow.
const pad = (n: number) => String(n).padStart(2, '0')

/** YYYY-MM-DD in the user's local time zone. Pass a Date or an ISO timestamp. */
export function localDateISO(d: Date | string = new Date()): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`
}

/** MM-DD in local time (chart axis labels). */
export function localMonthDay(d: Date | string): string {
  return localDateISO(d).slice(5)
}

/** "Oct 2" in local time. */
export function localShortDate(d: Date | string = new Date()): string {
  const x = typeof d === 'string' ? new Date(d) : d
  return x.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
