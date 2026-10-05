import { HIP_FLEX_SIDES_DIFFER_LINE, hipSidesDiffer } from '../lib/hipFlex'

// Per-leg hip flexion note (Stacy-cleared, Oct 5 2026): "Left and right are different" when the
// legs are 10 degrees or more apart. Used on every hip flexion display (Assessment step, My Body row).
export function HipSidesNote({ left, right, className }: {
  left: number | string | null | undefined
  right: number | string | null | undefined
  className?: string
}) {
  if (!hipSidesDiffer(left, right)) return null
  return <p className={className} data-testid="hip-sides-note">{HIP_FLEX_SIDES_DIFFER_LINE}</p>
}
