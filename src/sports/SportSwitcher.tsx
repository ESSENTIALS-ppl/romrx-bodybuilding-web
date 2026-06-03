/**
 * SportSwitcher — dropdown that lets multi-sport users switch active sport.
 *
 * Hidden when the user has <= 1 sport enabled (today's common case).
 */

import { useSport } from './SportProvider'

export function SportSwitcher() {
  const { activeSport, availableSports, setActiveSport, loading } = useSport()

  if (loading) return null
  if (availableSports.length <= 1) return null

  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">Active sport</span>
      <select
        value={activeSport.slug}
        onChange={(e) => {
          void setActiveSport(e.target.value)
        }}
        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-sm shadow-sm focus:border-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
      >
        {availableSports.map((s) => (
          <option key={s.slug} value={s.slug}>
            {s.display_name}
          </option>
        ))}
      </select>
    </label>
  )
}
