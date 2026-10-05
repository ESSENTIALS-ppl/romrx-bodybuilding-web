// Position Readiness Score (PRS), shared by My Body, Results preview and Settings (one copy, was three).
// Hip flexion is NOT in the score: it is saved for each leg and not scored (see ./hipFlex.ts).
// Everything else is unchanged: same thresholds, same deductions, same AT RISK / ELITE tiers on each page.

export interface BilateralJoint { l: string; r: string; riskBelow: number; normalMin: number }
export interface MidlineJoint { key: string; riskBelow: number; normalMin: number }

export const PRS_BILATERAL: readonly BilateralJoint[] = [
  { l: 'hip_er_l',        r: 'hip_er_r',        riskBelow: 40,  normalMin: 40  },
  { l: 'hip_ir_l',        r: 'hip_ir_r',        riskBelow: 30,  normalMin: 30  },
  { l: 'hip_abd_l',       r: 'hip_abd_r',       riskBelow: 25,  normalMin: 35  },
  { l: 'shoulder_er_l',   r: 'shoulder_er_r',   riskBelow: 60,  normalMin: 60  },
  { l: 'shoulder_flex_l', r: 'shoulder_flex_r', riskBelow: 120, normalMin: 140 },
  { l: 'ankle_df_l',      r: 'ankle_df_r',      riskBelow: 10,  normalMin: 10  },
  { l: 'cervical_lat_l',  r: 'cervical_lat_r',  riskBelow: 30,  normalMin: 40  },
]

export const PRS_UNILATERAL: readonly MidlineJoint[] = [
  { key: 'lumbar_flex',   riskBelow: 40, normalMin: 40 },
  { key: 'lumbar_ext',    riskBelow: 15, normalMin: 20 },
  { key: 'cervical_flex', riskBelow: 35, normalMin: 45 },
  { key: 'cervical_ext',  riskBelow: 40, normalMin: 55 },
]

type Row = Record<string, unknown>
const num = (v: unknown): number | null => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

export function computePRS(a: Row | object): number {
  const row = a as Row
  let score = 100
  for (const j of PRS_BILATERAL) {
    const l = num(row[j.l]), r = num(row[j.r])
    if (l != null && r != null) {
      const minVal = Math.min(l, r)
      const gap    = Math.abs(l - r)
      if (minVal < j.riskBelow) score -= 8
      else if (minVal < j.normalMin) score -= 4
      if (gap >= 15) score -= 6
      else if (gap >= 8) score -= 3
    }
  }
  for (const j of PRS_UNILATERAL) {
    const v = num(row[j.key])
    if (v != null) {
      if (v < j.riskBelow) score -= 6
      else if (v < j.normalMin) score -= 3
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}
