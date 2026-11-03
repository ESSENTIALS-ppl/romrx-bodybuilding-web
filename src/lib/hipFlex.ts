// Hip flexion (straight-leg raise) is saved for each leg and SCORED (target 120, FG-37 J2 / FG-36, same as Base).
// The old "not scored" fallback copy and filters were removed.

export const HIP_FLEX_SIDES_DIFFER_LINE = 'Left and right are different'
/** "Left and right are different" shows at a gap of 10 degrees or more. */
export const HIP_FLEX_SIDES_DIFFER_MIN_GAP = 10

/** Gap of 10 degrees or more between legs (both legs must be entered). */
export function hipSidesDiffer(left: number | string | null | undefined, right: number | string | null | undefined): boolean {
  if (left == null || right == null || left === '' || right === '') return false
  const l = Number(left), r = Number(right)
  if (!Number.isFinite(l) || !Number.isFinite(r)) return false
  return Math.abs(l - r) >= HIP_FLEX_SIDES_DIFFER_MIN_GAP
}
