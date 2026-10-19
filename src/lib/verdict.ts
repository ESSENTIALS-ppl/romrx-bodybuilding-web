// F-05: ONE GREEN/YELLOW/RED rule. This file is the server rule (compute-tiers v41) as a pure function.
// It is NOT wired into any screen yet; wiring is blocked on Jim decision D1 (see docs/verdict-rule.md).
//
//   per joint:  ratio = worst side value / required minimum
//   technique:  RED    if any measured joint ratio < 0.90
//               YELLOW if any measured joint ratio is 0.90 to < 1.00, or any required joint was not measured
//               GREEN  if every required joint is measured and ratio >= 1.00 (or nothing is required)
export type Verdict = 'GREEN' | 'YELLOW' | 'RED'

export const YELLOW_BAND = 0.9

export interface JointCheck {
  /** Worst side (min of left and right) for bilateral joints, or the single value. null = not measured. */
  value: number | null
  /** Required minimum degrees for this technique. */
  required: number
}

export function verdictFor(joints: JointCheck[]): Verdict {
  const required = joints.filter(j => j.required > 0)
  if (required.length === 0) return 'GREEN'
  let missing = false
  let worst: number | null = null
  for (const j of required) {
    if (j.value == null) { missing = true; continue }
    const ratio = j.value / j.required
    if (worst == null || ratio < worst) worst = ratio
  }
  if (worst != null && worst < YELLOW_BAND) return 'RED'
  if (missing || (worst != null && worst < 1)) return 'YELLOW'
  return 'GREEN'
}

/** Words shown next to the color, if D1 keeps the BB wording. */
export const VERDICT_WORD: Record<Verdict, string> = {
  GREEN: 'Ready',
  YELLOW: 'Caution',
  RED: 'Mobility first',
}
