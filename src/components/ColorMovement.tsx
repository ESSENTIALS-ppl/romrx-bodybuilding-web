import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { TECHNIQUE_COLUMNS, assessmentAt, latestTwo, movementBetween } from '../lib/colorMovementDerive'

// FG-19: how many techniques changed color between the user's two most recent assessments (my_color_movement rpc, signed-in user only).
// Words are the existing tier names with an arrow. Renders nothing unless the rpc answers status 'ok' with at least one change,
// so there is no empty state and no new text. No payment or entitlement logic here.
// When the rpc has fewer than two stored sets (insufficient_data), the same counts are derived here from the user's two most recent
// assessments (a sport pack is Base plus sport, one assessments table) and the sport's techniques. With fewer than two assessments
// there is nothing to compare and nothing is shown.
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

const SPORT = 'bodybuilding'

/** Own two most recent assessments plus the sport's techniques (both read-only selects). Null when signed out or fewer than two assessments. */
async function deriveFromAssessments(sport: string): Promise<Movement | null> {
  const { data: sess } = await supabase.auth.getSession()
  const uid = sess?.session?.user?.id
  if (!uid) return null
  const { data: rows, error: aErr } = await supabase.from('assessments').select('*').eq('user_id', uid).order('created_at', { ascending: false }).limit(10)
  if (aErr || !rows) return null
  const pair = latestTwo(rows as Array<Record<string, unknown>>)
  if (!pair) return null
  const { data: techs, error: tErr } = await supabase.from('techniques').select(TECHNIQUE_COLUMNS).eq('sport', sport)
  if (tErr || !techs || techs.length === 0) return null
  return movementBetween(pair[0], pair[1], techs as unknown as Array<{ id: string } & Record<string, unknown>>, assessmentAt(pair[0]), assessmentAt(pair[1])) as Movement
}

export function ColorMovement() {
  const [m, setM] = useState<Movement | null>(null)
  useEffect(() => {
    let live = true
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('my_color_movement', { p_sport: 'bodybuilding' })
        const row = Array.isArray(data) ? data[0] : data
        if (!error && row && row.status === 'ok') { if (live) setM(row as Movement); return }
        const derived = await deriveFromAssessments(SPORT)
        if (live && derived) setM(derived)
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
