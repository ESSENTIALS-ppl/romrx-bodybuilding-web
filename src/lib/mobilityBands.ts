/**
 * Locked Base mobility band labels - keep in sync with ROMBot CBase
 * (romrxbjj-v2 supabase/functions/ai-chat/handler.js).
 *
 * joint_scores: 1 → Needs focus, 2 → Building, 3 → Steady
 * Chips (space-tight): Focus · Building · Steady
 * Progress-needed tone; never AT RISK / RESTRICTED / ELITE / Position Readiness.
 */

export const BAND_FULL = {
  1: 'Needs focus',
  2: 'Building',
  3: 'Steady',
} as const

export const BAND_CHIP = {
  1: 'Focus',
  2: 'Building',
  3: 'Steady',
} as const

export type BandScore = 1 | 2 | 3

/** Map joint_scores score (1|2|3) or internal aliases to band score. */
export function bandScoreFromJointScore(
  score: number | string | null | undefined,
): BandScore | null {
  if (score === 1 || score === '1' || score === 'at_risk' || score === 'red' || score === 'needs_focus') {
    return 1
  }
  if (score === 2 || score === '2' || score === 'building' || score === 'yellow') {
    return 2
  }
  if (score === 3 || score === '3' || score === 'steady' || score === 'green') {
    return 3
  }
  return null
}

/** Map a measured value against riskBelow / normalMin to band score. */
export function bandScoreFromThresholds(
  val: number,
  riskBelow: number,
  normalMin: number,
): BandScore {
  if (val < riskBelow) return 1
  if (val < normalMin) return 2
  return 3
}

/**
 * Map aggregate 0-100 mobility score (legacy PRS) onto the locked 3 bands.
 * >=70 Steady, >=40 Building, else Needs focus.
 */
export function bandScoreFromAggregate(score: number): BandScore {
  if (score >= 70) return 3
  if (score >= 40) return 2
  return 1
}

export function bandFull(score: BandScore): string {
  return BAND_FULL[score]
}

export function bandChip(score: BandScore): string {
  return BAND_CHIP[score]
}

/** Progress-needed descriptions for aggregate chrome (non-threatening). */
export const BAND_DESC: Record<BandScore, string> = {
  1: 'Priority joints need work. Small daily progress moves you up.',
  2: 'Progress needed on key joints. Stay consistent with your plan.',
  3: 'Solid mobility foundation. Keep training and retest regularly.',
}
