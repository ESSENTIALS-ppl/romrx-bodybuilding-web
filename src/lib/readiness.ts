// Readiness score for My Body, Results preview and Settings (FG-37 J1).
// A sport pack is Base plus sport, so the pack shows the SAME /100 score and the SAME three bands
// (Steady, Building, Needs focus) as Base. The math lives in ./mobilityBands.ts, copied verbatim from
// Base app/src/lib/mobilityBands.ts (with ./lumbarFlag.ts). Hip flexion is scored (target 120, FG-36).
// Older assessments are not recomputed in storage: the score is derived from the saved joint values.
import { mobilityScoreForAssessment, overallBandForAssessment, type BandScore } from './mobilityBands'

export interface BilateralJoint { l: string; r: string; riskBelow: number; normalMin: number }

/** Joint pairs used only to list the biggest left/right gaps on the Results preview. */
export const PRS_BILATERAL: readonly BilateralJoint[] = [
  { l: 'hip_er_l',        r: 'hip_er_r',        riskBelow: 40,  normalMin: 40  },
  { l: 'hip_ir_l',        r: 'hip_ir_r',        riskBelow: 30,  normalMin: 30  },
  { l: 'hip_abd_l',       r: 'hip_abd_r',       riskBelow: 25,  normalMin: 35  },
  { l: 'shoulder_er_l',   r: 'shoulder_er_r',   riskBelow: 60,  normalMin: 60  },
  { l: 'shoulder_flex_l', r: 'shoulder_flex_r', riskBelow: 120, normalMin: 140 },
  { l: 'ankle_df_l',      r: 'ankle_df_r',      riskBelow: 10,  normalMin: 10  },
  { l: 'cervical_lat_l',  r: 'cervical_lat_r',  riskBelow: 30,  normalMin: 40  },
]

/** Base /100 score for one assessment (same function Base uses). */
export function computePRS(a: object): number {
  return mobilityScoreForAssessment(a)
}

/** Base band for one assessment: worst scored joint, 3 Steady, 2 Building, 1 Needs focus. */
export function readinessBand(a: object): BandScore {
  return overallBandForAssessment(a) ?? 3
}
