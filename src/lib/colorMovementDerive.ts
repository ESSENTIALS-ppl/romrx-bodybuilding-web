// FG-19 fallback: a sport pack is Base plus sport, and both write to the same assessments table. When the my_color_movement rpc
// has fewer than two stored eligibility sets (insufficient_data), the same tiers are worked out here from the user's own two most
// recent assessments and the sport's techniques. The rules are the ones in recompute_user_eligibility (SQL):
//   per joint: min of left and right (a missing side is ignored), ratio = measured / minimum;
//   a technique with no minimums is GREEN; worst ratio under 0.90 is RED; any required joint not measured or worst ratio under 1.0 is YELLOW; otherwise GREEN.
// Pure functions, no network, no new words.

export type Tier = 'RED' | 'YELLOW' | 'GREEN'

export type DerivedAssessment = Record<string, unknown>
export type DerivedTechnique = { id: string } & Record<string, unknown>

// [technique minimum column, assessment left column, assessment right column or null for a single-value joint]
const JOINTS: Array<[string, string, string | null]> = [
  ['hip_er_min', 'hip_er_l', 'hip_er_r'],
  ['hip_ir_min', 'hip_ir_l', 'hip_ir_r'],
  ['hip_abd_min', 'hip_abd_l', 'hip_abd_r'],
  ['hip_flex_min', 'hip_flex_l', 'hip_flex_r'],
  ['shoulder_er_min', 'shoulder_er_l', 'shoulder_er_r'],
  ['shoulder_flex_min', 'shoulder_flex_l', 'shoulder_flex_r'],
  ['ankle_df_min', 'ankle_df_l', 'ankle_df_r'],
  ['cervical_rot_min', 'cervical_rot_l', 'cervical_rot_r'],
  ['cervical_lat_min', 'cervical_lat_l', 'cervical_lat_r'],
  ['lumbar_flex_min', 'lumbar_flex', null],
  ['lumbar_ext_min', 'lumbar_ext', null],
  ['cervical_flex_min', 'cervical_flex', null],
  ['cervical_ext_min', 'cervical_ext', null],
]

/** The technique columns the tiers need (select list for the techniques read). */
export const TECHNIQUE_COLUMNS = ['id', 'sport', ...JOINTS.map(j => j[0])].join(',')

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Postgres LEAST: the smallest non-null value, null only when every value is null. */
function leastOf(a: unknown, b: unknown): number | null {
  const x = num(a), y = num(b)
  if (x === null) return y
  if (y === null) return x
  return Math.min(x, y)
}

export function tierFor(assessment: DerivedAssessment, technique: DerivedTechnique): Tier {
  let reqCount = 0
  let worst: number | null = null
  let anyMissing = false
  for (const [minCol, lCol, rCol] of JOINTS) {
    const thresh = num(technique[minCol])
    if (thresh === null || thresh === 0) continue
    reqCount++
    const aval = rCol ? leastOf(assessment[lCol], assessment[rCol]) : num(assessment[lCol])
    if (aval === null) { anyMissing = true; continue }
    const ratio = aval / thresh
    if (worst === null || ratio < worst) worst = ratio
  }
  if (reqCount === 0) return 'GREEN'
  if (worst !== null && worst < 0.9) return 'RED'
  if (anyMissing || (worst !== null && worst < 1.0)) return 'YELLOW'
  return 'GREEN'
}

export type DerivedMovement = {
  status: 'ok'
  earlier_at: string | null
  later_at: string | null
  red_to_yellow: number
  red_to_green: number
  yellow_to_green: number
  green_to_yellow: number
  yellow_to_red: number
  green_to_red: number
}

/** Count the techniques whose tier changed from the earlier assessment to the later one. */
export function movementBetween(
  earlier: DerivedAssessment,
  later: DerivedAssessment,
  techniques: DerivedTechnique[],
  earlierAt: string | null,
  laterAt: string | null,
): DerivedMovement {
  const out: DerivedMovement = {
    status: 'ok', earlier_at: earlierAt, later_at: laterAt,
    red_to_yellow: 0, red_to_green: 0, yellow_to_green: 0, green_to_yellow: 0, yellow_to_red: 0, green_to_red: 0,
  }
  for (const t of techniques) {
    const a = tierFor(earlier, t), b = tierFor(later, t)
    if (a === b) continue
    if (a === 'RED' && b === 'YELLOW') out.red_to_yellow++
    else if (a === 'RED' && b === 'GREEN') out.red_to_green++
    else if (a === 'YELLOW' && b === 'GREEN') out.yellow_to_green++
    else if (a === 'GREEN' && b === 'YELLOW') out.green_to_yellow++
    else if (a === 'YELLOW' && b === 'RED') out.yellow_to_red++
    else if (a === 'GREEN' && b === 'RED') out.green_to_red++
  }
  return out
}

/** The date an assessment counts from: assessed_at, else created_at (same as the rpc). */
export const assessmentAt = (a: DerivedAssessment): string | null => (a.assessed_at as string | null) ?? (a.created_at as string | null) ?? null

/** The two most recent assessments, newest last as [earlier, later]; null when there are fewer than two. */
export function latestTwo(rows: DerivedAssessment[]): [DerivedAssessment, DerivedAssessment] | null {
  const dated = rows
    .map(r => ({ r, t: Date.parse(String(assessmentAt(r) ?? '')) }))
    .filter(x => Number.isFinite(x.t))
    .sort((x, y) => y.t - x.t)
  if (dated.length < 2) return null
  return [dated[1].r, dated[0].r]
}
