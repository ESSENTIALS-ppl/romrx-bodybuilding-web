// Hip flexion (straight-leg raise) is saved for each leg and NOT scored.
// Same display as romrx.io (Stacy cleared the wording, Oct 5 2026): no target, no badge, no "Normal" range,
// never ranked as a priority joint, never part of the Position Readiness score or the red flags.
// Copy below is word for word; do not edit without Stacy.

export const HIP_FLEX_NOT_SCORED_LINE = 'Saved for each leg, not scored.'
export const HIP_FLEX_NOT_SCORED_CHIP = 'Not scored'
export const HIP_FLEX_SIDES_DIFFER_LINE = 'Left and right are different'
/** "Left and right are different" shows at a gap of 10 degrees or more. */
export const HIP_FLEX_SIDES_DIFFER_MIN_GAP = 10

/** Assessment keys that are saved but never scored. */
export const NOT_SCORED_KEYS: ReadonlySet<string> = new Set(['hip_flex', 'hip_flex_l', 'hip_flex_r'])

/** true for 'hip_flex', 'hip_flex_l', 'hip_flex_r' (also 'Hip Flex' / 'Hip Flexion' labels). */
export function isHipFlex(key: string | null | undefined): boolean {
  if (!key) return false
  const k = key.trim().toLowerCase()
  return NOT_SCORED_KEYS.has(k) || k === 'hip flex' || k === 'hip flexion'
}

/** Gap of 10 degrees or more between legs (both legs must be entered). */
export function hipSidesDiffer(left: number | string | null | undefined, right: number | string | null | undefined): boolean {
  if (left == null || right == null || left === '' || right === '') return false
  const l = Number(left), r = Number(right)
  if (!Number.isFinite(l) || !Number.isFinite(r)) return false
  return Math.abs(l - r) >= HIP_FLEX_SIDES_DIFFER_MIN_GAP
}

/** Stored priority joints with hip flexion removed (older rows may still list it). */
export function withoutHipFlex(joints: readonly string[] | null | undefined): string[] {
  return (joints ?? []).filter(j => !isHipFlex(j))
}

/** Stored red-flag reasons with any hip flexion reason removed (older rows may still carry one). */
export function withoutHipFlexReasons(reasons: readonly string[] | null | undefined): string[] {
  return (reasons ?? []).filter(r => !/hip[\s_-]*flex/i.test(r))
}
