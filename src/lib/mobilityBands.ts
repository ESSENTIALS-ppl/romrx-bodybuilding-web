import { isLumbarKey } from './lumbarFlag'
/**
 * Locked Base mobility band labels — keep in sync with ROMBot CBase
 * (romrxbjj-v2 supabase/functions/ai-chat/handler.js) AND with
 * public.compute_joint_scores() (persisted joint_scores.score).
 *
 * Product truth: joint_scores 1 → Needs focus, 2 → Building, 3 → Steady.
 * SINGLE SOURCE OF TRUTH for Base bands (P0 2026-09-24): every surface (My Body
 * header + chips + bar colours, My Protocol, results preview, Settings history,
 * lead submit) must resolve bands through this file. Thresholds live ONLY in
 * bandScoreFromTargetRatio (mirrors public.compute_joint_scores()). Colours come
 * from BAND_TONE[band], never from a separate %/threshold check.
 * Labels are exactly Needs focus · Building · Steady everywhere (chips included).
 * Progress-needed tone; never AT RISK / RESTRICTED / ELITE / Position Readiness.
 * Guarded by src/lib/mobilityBands.test.ts (npm test).
 */

export const BAND_FULL = {
  1: 'Needs focus',
  2: 'Building',
  3: 'Steady',
} as const

/** Chips use the exact same labels as the full band (no 'Focus' shorthand). */
export const BAND_CHIP = BAND_FULL

export type BandScore = 1 | 2 | 3

/** Row shape from public.joint_scores / rombot_context.joint_scores. */
export interface JointScoreRow {
  joint_key?: string
  joint?: string
  score: number | string
  left_value?: number | null
  right_value?: number | null
  left?: number | null
  right?: number | null
  asymmetry_pct?: number | null
  asymmetry_flag?: string | null
  flag?: string | null
}

/**
 * Targets from public.compute_joint_scores() — NOT the measure-screen "Normal" ranges
 * (riskBelow/normalMin). Also the ONLY targets for the Base per-joint % and /100. Score bands:
 *   worse/target >= 1.0 → 3 Steady
 *   worse/target >= 0.90 → 2 Building
 *   else → 1 Needs focus
 */
export const JOINT_SCORE_TARGETS: Record<string, number> = {
  // Sources (range-proposal.md, Oct 21 2026; pooled mean minus 1 SD, WITH Wadhwa 2024 for the neck):
  //   hip ER / hip IR: Simoneau 1998 (PMID 9742472) + Roach 1991 (PMID 1881956).
  //   hip abduction 40: Oct 6 value, not in range-proposal.md (no position-matched paper); no typical range shown.
  //   shoulder flexion: Gill 2020 (PMID 33046038).
  //   ankle knee-to-wall: McBride 2026 (PMID 41723909), all ages.
  //   neck side bend / flexion / extension: Tousignant-Laflamme 2013 (PMID 23829201), Wolan-Nieroda 2020
  //     (PMID 32626769), Canovas-Ambit 2021 (PMID 33868830), Wadhwa 2024 (PMID 39677250).
  //   neck rotation 70: Oct 6 value, not in range-proposal.md.
  //   shoulder ER 85 (Oct 6 8:19 PM, Jim-approved, Quinn): Base is back to the STANDING goal-post test (arm out at 90,
  //     elbow bent). Replaces 40 (lying tucked-elbow test, 11:45 AM). No typical range is shown on screen (Stacy).
  // RANGE RESET (Jim Oct 21 2026 4:15 PM ET, range-proposal.md): target = pooled mean minus 1 SD = step normalLow, so the
  //   'Typical range' text and scoring agree (fixes neck 53/64 shown vs 50/60 scored). WITH Wadhwa 2024 for the neck.
  //   hip ER 23 / IR 24: Simoneau 1998 (PMID 9742472) + Roach 1991 (PMID 1881956). shoulder flexion 141: Gill 2020 (PMID 33046038).
  //   ankle 6.1 cm: McBride 2026 (PMID 41723909), all ages. neck side bend 37, flexion 39, extension 48: Tousignant-Laflamme 2013
  //   (PMID 23829201), Wolan-Nieroda 2020 (PMID 32626769), Canovas-Ambit 2021 (PMID 33868830), Wadhwa 2024 (PMID 39677250).
  //   Unchanged: hip abduction 40, hip flexion 120 (unscored), shoulder ER 85, neck rotation 70, lumbar. 90% Building rule unchanged.
  // Mirrored in public.compute_joint_scores() and romrxbjj-v2 compute-tiers JOINT_TARGETS + submit-lead-assessment email.ts BAND_JOINTS.
  hip_er: 23,
  hip_ir: 24,
  hip_abd: 40,
  hip_flex: 120,
  shoulder_er: 85,
  shoulder_flex: 141,
  ankle_df: 6.1,
  cervical_rot: 70,
  cervical_lat: 37,
  lumbar_flex: 60,
  lumbar_ext: 25,
  cervical_flex: 39,
  cervical_ext: 48,
}

/**
 * HIP FLEXION SAFE FALLBACK (hotfix, Oct 3, 2026). ONE switch.
 *
 * The Base hip flexion step is a straight-leg raise. The old 120 deg target
 * (and the 100-120 range) cannot be reached by a straight-leg raise (published
 * average for men is about 68 deg), so scoring it would give some users a false
 * "Needs focus". While this is true, hip flexion is recorded and shown per leg
 * but gets NO band, NO per-joint %, is left out of the /100 average, is never a
 * weak spot (problem area), and persisted joint_scores / worst_joints values
 * for it are ignored. Sex-specific per-leg grading (Quinn's table) is a
 * follow-up that needs the user's sex plus backend changes.
 */
export const HIP_FLEX_UNSCORED_FALLBACK = false // FG-37 J2 (paired with FG-36): hip flexion is scored on the pack sites, target 120

const UNSCORED_JOINT_KEYS: ReadonlySet<string> = HIP_FLEX_UNSCORED_FALLBACK
  ? new Set(['hip_flex'])
  : new Set<string>()

/** True when a joint (hip_flex or hip_flex_l / hip_flex_r) is shown but never judged. */
export function isUnscoredJoint(jointKey: string): boolean {
  return UNSCORED_JOINT_KEYS.has(jointKey.replace(/_(l|r)$/, ''))
}

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

/**
 * Exact same formula as public.compute_joint_scores() CASE expression.
 * Use only when persisted joint_scores rows are missing.
 */
export function bandScoreFromTargetRatio(worse: number, target: number): BandScore {
  if (!(target > 0) || !Number.isFinite(worse)) return 1
  const ratio = worse / target
  if (ratio >= 1.0) return 3
  if (ratio >= 0.9) return 2
  return 1
}

/**
 * T1 option A (Jim, Oct 21 2026 10:53 AM ET, "T1: A plus C"; narrowed 11:47 AM ET; buffer values Quinn
 * t1-quinn-buffers.md 11:47:58 AM ET). PER-JOINT CONFIG: each narrow joint has a buffer at the Steady line
 * (steady) and one at the Building line (building). A reading inside a buffer gets the better color.
 * Stored values never change. Same table in SQL public.t1_narrow_buffer(), romrxbjj-v2
 * supabase/functions/_shared/t1_narrow_bands.ts (compute-tiers + lead email). Units: deg, ankle_df cm.
 *   Steady   if worse + steady >= target
 *   Building if worse + building >= 0.9 x target
 *   else Needs focus
 * Joints not listed keep bandScoreFromTargetRatio exactly. A buffered Steady shows the REAL percent, never 100.
 */
export const NARROW_BAND_CONFIG: Readonly<Record<string, { steady: number; building: number }>> = {
  // Jim Oct 21 4:38 PM ET (via Grant 4:56 PM): "Drop the T1 buffers on the reset moves." Hip ER, hip IR,
  // neck side bend, neck flexion, neck extension, ankle and shoulder flexion now use the range reset
  // targets with NO buffer. Only the joints that were not reset keep their T1 buffer.
  hip_abd: { steady: 2, building: 0 },
  cervical_rot: { steady: 5, building: 5 },
  shoulder_er: { steady: 5, building: 5 },
}

const NO_BUFFER = { steady: 0, building: 0 }

/** Per-joint buffers (side keys allowed); zeros when not narrow. */
export function narrowBuffers(jointKey: string): { steady: number; building: number } {
  return NARROW_BAND_CONFIG[jointKeyBase(jointKey)] ?? NO_BUFFER
}

/** True when the joint has any buffer (option C weighting applies). */
export function isNarrowJoint(jointKey: string): boolean {
  const b = narrowBuffers(jointKey)
  return b.steady > 0 || b.building > 0
}

/** Steady-line buffer (kept for callers and tests). */
export function narrowBuffer(jointKey: string): number {
  return narrowBuffers(jointKey).steady
}

/** 6-decimal fixed point so float noise (21.1 + 5) can never flip a cutoff; SQL numeric is exact. */
function fx(n: number): number {
  return Math.round(n * 1e6)
}

/** THE Base band for one joint value: option A buffers on narrow joints (zero elsewhere), fixed-point compare. */
export function bandScoreForJoint(jointKey: string, worse: number, target: number): BandScore {
  // 90%-edge rounding fix (T1): EVERY joint compares in 6-decimal fixed point so JS float noise
  // (e.g. 21.6 / 24) can never disagree with SQL numeric. Non-narrow joints use zero buffers.
  if (!(target > 0) || !Number.isFinite(worse)) return 1
  const b = narrowBuffers(jointKey)
  if (fx(worse + b.steady) >= fx(target)) return 3
  if (fx(worse + b.building) * 10 >= fx(target) * 9) return 2
  return 1
}

/**
 * T1 option C. Protocol weight for a joint gap: narrow joints count 0.5 until two assessments
 * in a row (this one and the previous one) show the same band for that joint, then 1.
 * Non-narrow joints are always 1. Internal ordering only: no user step, no copy.
 */
export const NARROW_GAP_WEIGHT = 0.5

export function narrowGapWeight(jointKey: string, band: BandScore, previousBand: BandScore | null | undefined): number {
  if (!isNarrowJoint(jointKey)) return 1
  return previousBand != null && previousBand === band ? 1 : NARROW_GAP_WEIGHT
}

/** Gap used to order the Protocol: 0 when Steady, else 1 - min(1, worse/target), times narrowGapWeight. */
export function weightedJointGap(
  jointKey: string,
  worse: number,
  target: number,
  previousWorse?: number | null,
): number {
  const band = bandScoreForJoint(jointKey, worse, target)
  if (band === 3) return 0
  const gap = 1 - Math.min(1, Math.max(0, worse / target))
  const prevBand = previousWorse == null || !Number.isFinite(previousWorse) ? null : bandScoreForJoint(jointKey, previousWorse, target)
  return gap * narrowGapWeight(jointKey, band, prevBand)
}

/** Prefer worst (lowest) band among measured joints; null if none measured. */
export function worstBandScore(scores: Array<BandScore | null | undefined>): BandScore | null {
  let worst: BandScore | null = null
  for (const s of scores) {
    if (s == null) continue
    if (worst == null || s < worst) worst = s
  }
  return worst
}

export function jointKeyBase(key: string): string {
  return key.replace(/_(l|r)$/, '')
}

export function normalizeJointScoreKey(row: JointScoreRow): string | null {
  const raw = row.joint_key ?? row.joint
  if (!raw) return null
  return jointKeyBase(String(raw))
}

/** Build joint_key → BandScore map from persisted joint_scores rows. */
export function bandMapFromJointScores(
  rows: JointScoreRow[] | null | undefined,
): Map<string, BandScore> {
  const map = new Map<string, BandScore>()
  if (!rows) return map
  for (const row of rows) {
    const key = normalizeJointScoreKey(row)
    const band = bandScoreFromJointScore(row.score)
    if (key && band != null && !isUnscoredJoint(key)) map.set(key, band)
  }
  return map
}

/** Overall = worst joint_scores band (same as ROMBot CBase). */
export function overallBandFromJointScores(
  rows: JointScoreRow[] | null | undefined,
): BandScore | null {
  const bands: BandScore[] = []
  for (const row of rows ?? []) {
    const b = bandScoreFromJointScore(row.score)
    const k = normalizeJointScoreKey(row)
    if (b != null && !(k && (isUnscoredJoint(k) || isLumbarKey(k)))) bands.push(b) // Grant Oct 21 2026 7:20 PM: lumbar out of the overall
  }
  return worstBandScore(bands)
}

/**
 * Resolve band for a priority/joint key (ankle_df_l or ankle_df).
 * Prefers persisted joint_scores; else compute_joint_scores target ratio.
 */
export function bandForJointKey(
  jointKey: string,
  scoreMap: Map<string, BandScore>,
  measured?: { left?: number | null; right?: number | null; midline?: number | null },
): BandScore | null {
  const base = jointKeyBase(jointKey)
  if (isUnscoredJoint(base)) return null
  const fromDb = scoreMap.get(base)
  if (fromDb != null) return fromDb

  const target = JOINT_SCORE_TARGETS[base]
  if (target == null || !measured) return null

  const worse = worseSideValue(measured)
  if (worse == null) return null
  return bandScoreForJoint(base, worse, target)
}

export function bandFull(score: BandScore): string {
  return BAND_FULL[score]
}

export function bandChip(score: BandScore): string {
  return BAND_CHIP[score]
}

/** Progress-needed descriptions for aggregate chrome (non-threatening). */
export const BAND_DESC: Record<BandScore, string> = {
  1: 'Your problem areas need work. Small daily progress moves you up.',
  2: 'Progress needed on key joints. Stay consistent with your plan.',
  3: 'Solid mobility foundation. Keep training and retest regularly.',
}

/** Tailwind tone tokens for band chips / chrome (cobalt locked). */
export const BAND_TONE: Record<
  BandScore,
  { color: string; bg: string; ring: string; chip: string; label: string; bar: string; badge: string }
> = {
  1: {
    color: 'text-red-700',
    bg: 'bg-red-50',
    ring: 'border-red-400/40',
    chip: 'bg-red-50 text-red-700 border-red-200',
    label: 'text-red-700',
    bar: 'bg-red-400',
    badge: 'bg-red-600 text-white border border-red-600',
  },
  2: {
    color: 'text-yellow-700',
    bg: 'bg-yellow-50',
    ring: 'border-yellow-400/40',
    chip: 'bg-yellow-50 text-yellow-700 border-yellow-200',
    label: 'text-yellow-700',
    bar: 'bg-yellow-500',
    badge: 'bg-yellow-500 text-yellow-950 border border-yellow-500',
  },
  3: {
    color: 'text-cobalt',
    bg: 'bg-cobalt-light',
    ring: 'border-cobalt/40',
    chip: 'bg-cobalt-light text-cobalt border-cobalt/20',
    label: 'text-cobalt',
    bar: 'bg-cobalt',
    badge: 'bg-cobalt text-white border border-cobalt',
  },
}

/** Ordered legend entries for My Body chrome (always show all three). */
export const BAND_LEGEND: ReadonlyArray<{ score: BandScore; full: string; chip: string }> = [
  { score: 1, full: BAND_FULL[1], chip: BAND_CHIP[1] },
  { score: 2, full: BAND_FULL[2], chip: BAND_CHIP[2] },
  { score: 3, full: BAND_FULL[3], chip: BAND_CHIP[3] },
]

// ---------------------------------------------------------------------------
// Assessment-level resolvers (shared by every surface)
// ---------------------------------------------------------------------------

/** Joints scored by public.compute_joint_scores() (same columns, same order). */
export const ASSESSMENT_JOINTS: ReadonlyArray<{ key: string; l?: string; r?: string; single?: string }> = [
  { key: 'hip_er', l: 'hip_er_l', r: 'hip_er_r' },
  { key: 'hip_ir', l: 'hip_ir_l', r: 'hip_ir_r' },
  { key: 'hip_abd', l: 'hip_abd_l', r: 'hip_abd_r' },
  { key: 'hip_flex', l: 'hip_flex_l', r: 'hip_flex_r' },
  { key: 'shoulder_er', l: 'shoulder_er_l', r: 'shoulder_er_r' },
  { key: 'shoulder_flex', l: 'shoulder_flex_l', r: 'shoulder_flex_r' },
  { key: 'ankle_df', l: 'ankle_df_l', r: 'ankle_df_r' },
  { key: 'cervical_rot', l: 'cervical_rot_l', r: 'cervical_rot_r' },
  { key: 'cervical_lat', l: 'cervical_lat_l', r: 'cervical_lat_r' },
  { key: 'lumbar_flex', single: 'lumbar_flex' },
  { key: 'lumbar_ext', single: 'lumbar_ext' },
  { key: 'cervical_flex', single: 'cervical_flex' },
  { key: 'cervical_ext', single: 'cervical_ext' },
]

function toNum(v: unknown): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

/**
 * Per-joint bands for one assessment. Persisted joint_scores win; any joint
 * without a row is scored with the identical compute_joint_scores() formula.
 */
export function jointBandsForAssessment(
  assessment: object | null | undefined,
  jointScores?: JointScoreRow[] | null,
): Map<string, BandScore> {
  const map = bandMapFromJointScores(jointScores)
  if (!assessment) return map
  const rec = assessment as Record<string, unknown>
  for (const j of ASSESSMENT_JOINTS) {
    if (map.has(j.key)) continue
    const band = bandForJointKey(j.key, map, {
      left: j.l ? toNum(rec[j.l]) : null,
      right: j.r ? toNum(rec[j.r]) : null,
      midline: j.single ? toNum(rec[j.single]) : null,
    })
    if (band != null) map.set(j.key, band)
  }
  return map
}

/**
 * THE overall Mobility band for an assessment (My Body, My Protocol, results
 * preview, Settings history, lead submit): worst joint band, same as ROMBot CBase.
 * null only when no joint is measured.
 */
export function overallBandForAssessment(
  assessment: object | null | undefined,
  jointScores?: JointScoreRow[] | null,
): BandScore | null {
  // Grant Oct 21 2026 7:20 PM: lumbar out of the overall: lumbar bands are still computed per joint for saved values but never count here.
  return worstBandScore([...jointBandsForAssessment(assessment, jointScores).entries()].filter(([k]) => !isLumbarKey(k)).map(([, b]) => b))
}

/** Copy says "top three problem areas" — never show more than this. */
export const TOP_PROBLEM_AREAS_MAX = 3

/**
 * Every SCORED joint of an assessment as one side-specific key (worse side;
 * midline joints use their own key), worst first (lowest worse/target ratio,
 * capped at 1, same ordering rule as compute-tiers). Unscored joints (hip
 * flexion while HIP_FLEX_UNSCORED_FALLBACK is on) and unmeasured joints are
 * never included, so a top-N cut taken from this list can never contain them.
 * T1 option C: ordered by weightedJointGap (largest first). Pass the user's previous assessment
 * so narrow joints whose band agrees across both get full weight; without it they count 0.5.
 */
export function scoredJointKeysWorstFirst(
  assessment: object | null | undefined,
  previous?: object | null,
): string[] {
  if (!assessment) return []
  const rec = assessment as Record<string, unknown>
  const prev = (previous ?? null) as Record<string, unknown> | null
  const rows: { key: string; gap: number; order: number }[] = []
  ASSESSMENT_JOINTS.forEach((j, order) => {
    if (isUnscoredJoint(j.key)) return
    const m = measuredFor(rec, j)
    const worse = worseSideValue(m)
    const target = JOINT_SCORE_TARGETS[j.key]
    if (worse == null || !(target > 0) || !Number.isFinite(worse)) return
    let key = j.key
    if (j.l && j.r) {
      const useRight = m.left != null && m.right != null && m.right < m.left
      const onlyRight = m.left == null && m.right != null
      key = useRight || onlyRight ? j.r : j.l
    }
    const prevWorse = prev ? worseSideValue(measuredFor(prev, j)) : null
    rows.push({ key, gap: weightedJointGap(j.key, worse, target, prevWorse), order })
  })
  rows.sort((a, b) => b.gap - a.gap || a.order - b.order)
  return rows.map(r => r.key)
}

/**
 * Top problem areas, ALWAYS picked from scored joints only. Unscored joints
 * (hip flexion, HIP_FLEX_UNSCORED_FALLBACK) are removed BEFORE ranking and
 * slicing, never after, so the list is never short because one was dropped.
 *
 * Order: assessments.worst_joints first (compute-tiers writes 5 side-specific
 * keys, worst first; deduped by joint, keeping the worse side that appears
 * first), then `candidates` (all scored joints, worst first, see
 * scoredJointKeysWorstFirst) fill any remaining slots. Capped at max.
 * Pass `candidates` from the assessment so a persisted worst_joints that
 * included an unscored joint still yields a full top 3.
 */
export function topProblemAreas(
  worstJoints: ReadonlyArray<string> | null | undefined,
  max: number = TOP_PROBLEM_AREAS_MAX,
  candidates: ReadonlyArray<string> = [],
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const k of [...(worstJoints ?? []), ...candidates]) {
    if (!k) continue
    const base = jointKeyBase(k)
    if (isUnscoredJoint(base)) continue
    if (isLumbarKey(base)) continue // Grant Oct 21 2026 7:10 PM: low back never ranked (saved values kept)
    if (seen.has(base)) continue
    seen.add(base)
    out.push(k)
    if (out.length >= max) break
  }
  return out
}

/** Top problem areas for one assessment (worst_joints + scored-joint fill). */
export function topProblemAreasForAssessment(
  assessment: object | null | undefined,
  max: number = TOP_PROBLEM_AREAS_MAX,
  previous?: object | null,
): string[] {
  const worst = (assessment as { worst_joints?: ReadonlyArray<string> | null } | null | undefined)?.worst_joints
  return topProblemAreas(worst, max, scoredJointKeysWorstFirst(assessment, previous))
}

// ---------------------------------------------------------------------------
// Per-joint % and the /100 score: ONE shared formula for every Base surface
// ---------------------------------------------------------------------------
//
// Fix A (Jim LOCK via Grant, 2026-09-24 5:32 PM ET). Base is for normal people,
// so every Base number is measured against JOINT_SCORE_TARGETS (the same targets
// that drive the bands), never against the elite sport-pack table.
//
//   per-joint %  = floor(100 * min(1, worse / target))            (worse side = midline,
//                  or the lower of L/R, exactly as bandForJointKey)  then clamped into
//                  the joint's band range, so Steady = 100, Building = 90..99,
//                  Needs focus = 0..89 ALWAYS (floor, not round: 89.6 never shows 90).
//   /100 score   = s = floor(mean over measured joints of min(1, worse/target) * 100),
//                  then clamped into the OVERALL band's range (overall = worst joint):
//                  Needs focus → min(s, 89); Building → max(90, min(s, 99)); Steady → 100.
//
// MIRRORED in romrxbjj-v2 supabase/functions/submit-lead-assessment/email.ts
// (lead results email). Any change here MUST be ported there in the same breath;
// the harness (mobilityBands.test.ts) pins the fixture values both sides print.

/** Lowest / highest % a band may display (inclusive). */
export const BAND_PERCENT_RANGE: Record<BandScore, { min: number; max: number }> = {
  1: { min: 0, max: 89 },
  2: { min: 90, max: 99 },
  3: { min: 100, max: 100 },
}

/**
 * T1 (Jim 11:47 AM ET Oct 21): a Steady reached only through the buffer shows the REAL percent (floor, under 100),
 * never 100. On narrow joints every per-joint / per-side % is the real floor percent (capped at 100), so a better
 * side can never show a lower % than the worse side (a clamped Building 90 next to a real buffered Steady 83).
 * Non-narrow joints and the /100 clamp into the band range exactly as before, except a buffered Steady /100.
 */
export function displayPercent(rawFloor: number, band: BandScore, narrow = false): number {
  if (narrow) return Math.max(0, Math.min(100, rawFloor))
  if (band === 3 && rawFloor < 100) return Math.max(0, rawFloor)
  return clampPercentToBand(rawFloor, band)
}

/** Clamp a 0..100 number into the band's range (used per joint AND for /100). */
export function clampPercentToBand(pct: number, band: BandScore): number {
  if (band === 3) return 100
  if (band === 2) return Math.max(90, Math.min(pct, 99))
  return Math.max(0, Math.min(pct, 89))
}

/** Worse side, the same rule bandForJointKey uses: midline, else lower of L/R, else the one side. */
export function worseSideValue(measured: {
  left?: number | null
  right?: number | null
  midline?: number | null
}): number | null {
  if (measured.midline != null) return measured.midline
  if (measured.left != null && measured.right != null) return Math.min(measured.left, measured.right)
  if (measured.left != null) return measured.left
  if (measured.right != null) return measured.right
  return null
}

/** min(1, worse / target) * 100, unfloored (0..100). null when unmeasured / no target. */
function cappedRatioPct(worse: number | null, target: number | undefined): number | null {
  if (worse == null || !Number.isFinite(worse) || target == null || !(target > 0)) return null
  return Math.min(1, Math.max(0, worse / target)) * 100
}

/**
 * THE per-joint % for Base (My Body Joint Breakdown bars + % and the radar).
 * `band` = the band that surface shows for this joint (persisted joint_scores
 * first); defaults to the compute_joint_scores() formula on the same values.
 */
export function jointPercent(
  jointKey: string,
  measured: { left?: number | null; right?: number | null; midline?: number | null },
  band?: BandScore | null,
): number | null {
  const base = jointKeyBase(jointKey)
  if (isUnscoredJoint(base)) return null
  const target = JOINT_SCORE_TARGETS[base]
  const worse = worseSideValue(measured)
  const raw = cappedRatioPct(worse, target)
  if (raw == null) return null
  const b = band ?? bandScoreForJoint(base, worse!, target)
  return displayPercent(Math.floor(raw), b, isNarrowJoint(jointKey))
}

function measuredFor(rec: Record<string, unknown>, j: { l?: string; r?: string; single?: string }) {
  return {
    left: j.l ? toNum(rec[j.l]) : null,
    right: j.r ? toNum(rec[j.r]) : null,
    midline: j.single ? toNum(rec[j.single]) : null,
  }
}

/** joint key → per-joint % for every measured joint of one assessment. */
export function jointPercentsForAssessment(
  assessment: object | null | undefined,
  jointScores?: JointScoreRow[] | null,
): Map<string, number> {
  const out = new Map<string, number>()
  if (!assessment) return out
  const rec = assessment as Record<string, unknown>
  const bands = jointBandsForAssessment(assessment, jointScores)
  for (const j of ASSESSMENT_JOINTS) {
    const pct = jointPercent(j.key, measuredFor(rec, j), bands.get(j.key) ?? null)
    if (pct != null) out.set(j.key, pct)
  }
  return out
}

/**
 * THE /100 mobility score for one assessment (My Body, My Protocol, results
 * preview, Settings history, My Body delta, lead submit). Pure and
 * deterministic. Pass the same jointScores the surface uses for its band so the
 * number is clamped into exactly the band shown next to it. With nothing
 * measured it returns 100, matching the surfaces' Steady fallback.
 */
export function mobilityScoreForAssessment(
  assessment: object | null | undefined,
  jointScores?: JointScoreRow[] | null,
): number {
  const rec = (assessment ?? {}) as Record<string, unknown>
  let sum = 0
  let n = 0
  for (const j of ASSESSMENT_JOINTS) {
    if (isUnscoredJoint(j.key)) continue
    if (isLumbarKey(j.key)) continue // Grant Oct 21 2026 7:20 PM: lumbar out of the overall /100
    const p = cappedRatioPct(worseSideValue(measuredFor(rec, j)), JOINT_SCORE_TARGETS[j.key])
    if (p == null) continue
    sum += p
    n += 1
  }
  if (n === 0) return 100
  const s = Math.floor(sum / n)
  const band = overallBandForAssessment(assessment, jointScores) ?? 3
  return displayPercent(s, band)
}

/**
 * Rank badge (#1/#2/#3 Problem area on My Protocol) is coloured by THAT joint's
 * band (Grant's call 2026-09-24): a solid badge in the band colour. Unmeasured
 * joints fall back to neutral slate.
 */
export function rankBadgeClass(band: BandScore | null | undefined): string {
  return band != null ? BAND_TONE[band].badge : 'bg-slate-100 text-slate-700 border border-slate-200'
}

/** Separator between score and band: U+00B7 MIDDLE DOT, never an em dash. */
export const SCORE_BAND_SEPARATOR = ' \u00B7 '

/**
 * Score + band together, exactly "96/100 · Steady". Used by every Base
 * surface that shows the overall band.
 */
export function formatScoreBand(score: number, band: BandScore): string {
  return `${score}/100${SCORE_BAND_SEPARATOR}${bandFull(band)}`
}

// ---------------------------------------------------------------------------
// My Body display rows (Joint Breakdown bars AND the radar), side colours,
// units. One list, one per-joint %, one band: the radar can never disagree
// with the bars (2026-09-24, radar + L/R follow-up to Fix A).
// ---------------------------------------------------------------------------

/**
 * Unit each joint is MEASURED and STORED in (assessment input fields,
 * assessmentSteps*.ts). Ankle DF is the knee-to-wall test, recorded in cm, and
 * its JOINT_SCORE_TARGETS value (20) is cm. Everything else is degrees.
 */
export const JOINT_UNITS: Record<string, '°' | 'cm'> = {
  ankle_df: 'cm',
}
export function jointUnit(jointKey: string): '°' | 'cm' {
  return JOINT_UNITS[jointKeyBase(jointKey)] ?? '°'
}

/** Format a measured value or L/R gap: max 1 decimal, no float noise (1.1000000000000014 → 1.1). */
export function formatMeasure(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(Number(v))) return '-'
  return String(Math.round(Number(v) * 10) / 10)
}

/** Joints on My Body Joint Breakdown and the radar: same set, same order. */
export const BASE_DISPLAY_JOINTS: ReadonlyArray<{
  key: string; label: string; short: string; l?: string; r?: string; single?: string
}> = [
  { key: 'hip_er', label: 'Hip ER', short: 'Hip ER', l: 'hip_er_l', r: 'hip_er_r' },
  { key: 'hip_ir', label: 'Hip IR', short: 'Hip IR', l: 'hip_ir_l', r: 'hip_ir_r' },
  { key: 'hip_abd', label: 'Hip Abduction', short: 'Hip Abd', l: 'hip_abd_l', r: 'hip_abd_r' },
  { key: 'hip_flex', label: 'Hip Flexion', short: 'Hip Flex', l: 'hip_flex_l', r: 'hip_flex_r' },
  { key: 'shoulder_er', label: 'Shoulder ER', short: 'Shoulder ER', l: 'shoulder_er_l', r: 'shoulder_er_r' },
  { key: 'shoulder_flex', label: 'Shoulder Flex', short: 'Shoulder Flex', l: 'shoulder_flex_l', r: 'shoulder_flex_r' },
  { key: 'ankle_df', label: 'Ankle DF', short: 'Ankle DF', l: 'ankle_df_l', r: 'ankle_df_r' },
  { key: 'lumbar_flex', label: 'Lumbar Flex', short: 'Lumbar Flex', single: 'lumbar_flex' },
  { key: 'lumbar_ext', label: 'Lumbar Ext', short: 'Lumbar Ext', single: 'lumbar_ext' },
  { key: 'cervical_lat', label: 'Cervical Lat Flex', short: 'Cerv Lat', l: 'cervical_lat_l', r: 'cervical_lat_r' },
  { key: 'cervical_flex', label: 'Cervical Flex', short: 'Cerv Flex', single: 'cervical_flex' },
  { key: 'cervical_ext', label: 'Cervical Ext', short: 'Cerv Ext', single: 'cervical_ext' },
]

export interface JointDisplayRow {
  key: string
  label: string
  short: string
  unit: '°' | 'cm'
  left: number | null
  right: number | null
  midline: number | null
  /** Band shown for this joint (persisted joint_scores first). null = unmeasured. */
  band: BandScore | null
  /** THE per-joint % (jointPercent). null when unmeasured or unscored (never a fake 0). */
  pct: number | null
  /** true = shown per leg but never judged (no band, no %, not in /100). See HIP_FLEX_UNSCORED_FALLBACK. */
  unscored: boolean
}

/** Rows for My Body Joint Breakdown AND radar (same values, same order). */
export function jointDisplayRowsForAssessment(
  assessment: object | null | undefined,
  jointScores?: JointScoreRow[] | null,
): JointDisplayRow[] {
  const rec = (assessment ?? {}) as Record<string, unknown>
  const bands = jointBandsForAssessment(assessment, jointScores)
  return BASE_DISPLAY_JOINTS.map(j => {
    const m = measuredFor(rec, j)
    const band = bands.get(j.key) ?? null
    return {
      key: j.key, label: j.label, short: j.short, unit: jointUnit(j.key),
      left: m.left, right: m.right, midline: m.midline,
      band,
      pct: jointPercent(j.key, m, band),
      unscored: isUnscoredJoint(j.key),
    }
  })
}

/** Hex band colours for SVG (radar dots); same hues as BAND_TONE[band].badge. */
export const BAND_HEX: Record<BandScore, string> = {
  1: '#DC2626', // red-600
  2: '#EAB308', // yellow-500
  3: '#1D4ED8', // cobalt
}

/**
 * Band for each side of a bilateral joint (My Protocol Left/Right numbers).
 * Each side is scored with the SAME rule as the joint (side / JOINT_SCORE_TARGETS
 * via bandScoreFromTargetRatio). The worse side always shows exactly the card's
 * band, and the better side is never shown below it, so a side colour can never
 * contradict the card chip even if persisted joint_scores differ from the formula.
 */
export function sideBandsForJoint(
  jointKey: string,
  sides: { left?: number | null; right?: number | null },
  jointBand?: BandScore | null,
): { left: BandScore | null; right: BandScore | null } {
  if (isUnscoredJoint(jointKey)) return { left: null, right: null }
  const target = JOINT_SCORE_TARGETS[jointKeyBase(jointKey)]
  const one = (v: number | null | undefined): BandScore | null =>
    v == null || target == null || !Number.isFinite(Number(v)) ? null : bandScoreForJoint(jointKey, Number(v), target)
  let left = one(sides.left)
  let right = one(sides.right)
  if (jointBand != null) {
    const l = sides.left == null ? null : Number(sides.left)
    const r = sides.right == null ? null : Number(sides.right)
    const leftIsWorse = l != null && (r == null || l <= r)
    const rightIsWorse = r != null && (l == null || r <= l)
    if (left != null) left = leftIsWorse ? jointBand : (Math.max(left, jointBand) as BandScore)
    if (right != null) right = rightIsWorse ? jointBand : (Math.max(right, jointBand) as BandScore)
  }
  return { left, right }
}

/** Text colour class for a side / single value: BAND_TONE colour, neutral when unmeasured. */
export function valueToneClass(band: BandScore | null | undefined): string {
  return band != null ? BAND_TONE[band].color : 'text-slate-500'
}

// ---------------------------------------------------------------------------
// Radar v2 (Jim 2026-09-24): Left and Right outlines, each side as % of the
// Base target, scored with the SAME per-side band rule as the My Protocol L/R
// colours (sideBandsForJoint). The worse side equals the bar % exactly.
// ---------------------------------------------------------------------------

/** % of Base target for ONE side, floored and clamped into that side's band. */
export function sidePercent(jointKey: string, value: number | null | undefined, sideBand: BandScore | null): number | null {
  if (isUnscoredJoint(jointKey)) return null
  const target = JOINT_SCORE_TARGETS[jointKeyBase(jointKey)]
  const v = value == null ? null : Number(value)
  const raw = cappedRatioPct(v, target)
  if (raw == null || v == null) return null
  const b = sideBand ?? bandScoreForJoint(jointKey, v, target)
  return displayPercent(Math.floor(raw), b, isNarrowJoint(jointKey))
}

export interface RadarSideRow {
  key: string
  label: string
  short: string
  /** true for cervical / lumbar single-value joints: one value on both lines. */
  midline: boolean
  measured: boolean
  /** Plotted Left / Right % (a missing side is drawn at the other side's value). */
  left: number
  right: number
  /** Measured side %, null when that side was not measured (tooltip shows "-"). */
  leftPct: number | null
  rightPct: number | null
  leftBand: BandScore | null
  rightBand: BandScore | null
  /** Worse-side % = the Joint Breakdown bar % (jointPercent). */
  worse: number
  /** Joint band (card / chip / bar band). */
  band: BandScore | null
  /** true = never judged (hip flexion fallback); the radar leaves this axis out. */
  unscored: boolean
}

/** One row per BASE_DISPLAY_JOINTS entry, same order as the bars. */
export function radarSideRowsForAssessment(
  assessment: object | null | undefined,
  jointScores?: JointScoreRow[] | null,
): RadarSideRow[] {
  return jointDisplayRowsForAssessment(assessment, jointScores).map(r => {
    const isMid = BASE_DISPLAY_JOINTS.find(j => j.key === r.key)?.single != null
    if (isMid) {
      const measured = r.midline != null
      return {
        key: r.key, label: r.label, short: r.short, midline: true, measured,
        left: r.pct ?? 0, right: r.pct ?? 0,
        leftPct: measured ? r.pct : null, rightPct: measured ? r.pct : null,
        leftBand: r.band, rightBand: r.band, worse: r.pct ?? 0, band: r.band, unscored: r.unscored,
      }
    }
    const sb = sideBandsForJoint(r.key, { left: r.left, right: r.right }, r.band)
    const lp = sidePercent(r.key, r.left, sb.left)
    const rp = sidePercent(r.key, r.right, sb.right)
    const measured = lp != null || rp != null
    return {
      key: r.key, label: r.label, short: r.short, midline: false, measured,
      left: lp ?? rp ?? 0, right: rp ?? lp ?? 0,
      leftPct: lp, rightPct: rp, leftBand: sb.left, rightBand: sb.right,
      worse: r.pct ?? 0, band: r.band, unscored: r.unscored,
    }
  })
}

/**
 * ONE shared top-N ranking for My Body and My Protocol (Reid, Oct 19 2026: the two screens disagreed).
 * Order = topProblemAreasForAssessment (worst_joints, deduped to base keys), then asymmetry, then severity.
 * Unscored joints (hip flexion) are never ranked. Callers pass their own joint rows.
 */
export function rankProblemJoints<T extends { key: string; asymmetry?: number; severity?: number }>(
  assessment: object | null | undefined,
  rows: readonly T[],
  max: number = TOP_PROBLEM_AREAS_MAX,
): T[] {
  const order = topProblemAreasForAssessment(assessment, max).map(jointKeyBase)
  const idx = (k: string) => { const i = order.indexOf(jointKeyBase(k)); return i === -1 ? Number.POSITIVE_INFINITY : i }
  return rows
    .filter(r => !isUnscoredJoint(r.key) && !isLumbarKey(jointKeyBase(r.key)))
    .slice()
    .sort((a, b) => {
      const ia = idx(a.key), ib = idx(b.key)
      if (ia !== ib) return ia - ib
      if ((b.asymmetry ?? 0) !== (a.asymmetry ?? 0)) return (b.asymmetry ?? 0) - (a.asymmetry ?? 0)
      return (b.severity ?? 0) - (a.severity ?? 0)
    })
    .slice(0, max)
}
