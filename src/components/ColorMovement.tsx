import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

// FG-19: how many techniques changed color between the user's two most recent assessments (my_color_movement rpc, signed-in user only).
// Words are the existing tier names with an arrow. Renders nothing unless the rpc answers status 'ok' with at least one change,
// so there is no empty state and no new text. No payment or entitlement logic here.
type Movement = {
  status: string
  earlier_at: string | null
  later_at: string | null
  red_to_yellow: number
  red_to_green: number
  yellow_to_green: number
  green_to_yellow: number
  yellow_to_red: number
  green_to_red: number
}

const MOVES: Array<[keyof Movement, string, string, string, string]> = [
  ['red_to_yellow', 'RED', 'YELLOW', 'tier-red', 'tier-yellow'],
  ['red_to_green', 'RED', 'GREEN', 'tier-red', 'tier-green'],
  ['yellow_to_green', 'YELLOW', 'GREEN', 'tier-yellow', 'tier-green'],
  ['green_to_yellow', 'GREEN', 'YELLOW', 'tier-green', 'tier-yellow'],
  ['yellow_to_red', 'YELLOW', 'RED', 'tier-yellow', 'tier-red'],
  ['green_to_red', 'GREEN', 'RED', 'tier-green', 'tier-red'],
]

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')

export function ColorMovement() {
  const [m, setM] = useState<Movement | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('my_color_movement', { p_sport: 'bodybuilding' })
        const row = Array.isArray(data) ? data[0] : data
        if (live && !error && row && row.status === 'ok') setM(row as Movement)
      } catch { /* the rpc is not there yet or the user is signed out: show nothing */ }
    })()
    return () => { live = false }
  }, [])
  if (!m) return null
  const shown = MOVES.filter(([k]) => Number(m[k]) > 0)
  if (shown.length === 0) return null
  return (
    <div className="flex gap-2 flex-wrap items-center" data-color-movement>
      <span className="text-xs text-miami-text/60">{day(m.earlier_at)} → {day(m.later_at)}</span>
      {shown.map(([k, from, to, fromCls, toCls]) => (
        <span key={k} className="inline-flex items-center gap-1 text-xs font-semibold" data-move={k}>
          <span className={`px-2 py-0.5 rounded-full ${fromCls}`}>{from}</span>
          <span aria-hidden="true">→</span>
          <span className={`px-2 py-0.5 rounded-full ${toCls}`}>{to}</span>
          <span>{Number(m[k])}</span>
        </span>
      ))}
    </div>
  )
}
