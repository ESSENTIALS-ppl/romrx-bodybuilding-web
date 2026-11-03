/**
 * BASE LOW-BACK REMOVAL (Jim CLOSED Oct 5 2026 10:59 PM, ledger L312: remove the low back step for now).
 *
 * ON  = the low back (lumbar flexion + extension) step is not in the Base assessment, nothing new is
 *       saved for it (null, never 0), My Body shows one "Low back: not measured" line instead of the two
 *       lumbar bars, and the radar leaves out unmeasured lumbar axes. Stored lumbar values are kept and
 *       used exactly as before.
 * OFF = the old behavior with the low back step.
 *
 * DEFAULT IS NOW ON (Oct 19 2026). Kill switch: set VITE_BASE_LUMBAR_REMOVED=0 in the Netlify env and
 * rebuild to bring the step back. Anything else (unset, "1") = ON.
 */
export function baseLumbarRemoved(): boolean {
  // Oct 21 2026 7:03 PM ET (Jim): permanent. The step is deleted from STEPS_PART2, so there is no kill switch.
  return true
}

export const LUMBAR_KEYS = ['lumbar_flex', 'lumbar_ext'] as const

/** Stacy pre-clear line for any slot that would show the low back. */
export const LOW_BACK_NOT_MEASURED = 'Low back: not measured'

export function isLumbarKey(key: string): boolean {
  return (LUMBAR_KEYS as readonly string[]).includes(key)
}

/** True when this assessment has no lumbar value at all (both null / missing). */
export function lumbarNotMeasured(assessment: object | null | undefined): boolean {
  const rec = (assessment ?? {}) as Record<string, unknown>
  return LUMBAR_KEYS.every(k => rec[k] == null || rec[k] === '')
}
