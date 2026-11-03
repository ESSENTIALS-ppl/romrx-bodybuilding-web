import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { hipFlexScoredAtMs, setHipFlexScoredAtMs, subscribeHipFlexScoredAt } from './hipFlexCutoverState'

// FG-36: one source for the hip flexion cutover = scoring_cutovers.hip_flex_scored.effective_at (Avery, set when the push happens).
// Read-only select. If the table, the row or read access is missing, nothing is set and everything stays pre-cutover (fail safe).
let inflight = false
export async function loadHipFlexScoredAt(): Promise<void> {
  if (hipFlexScoredAtMs() != null || inflight) return
  inflight = true
  try {
    const { data, error } = await supabase.from('scoring_cutovers').select('effective_at').eq('key', 'hip_flex_scored').maybeSingle()
    const t = !error && data?.effective_at ? Date.parse(String(data.effective_at)) : NaN
    if (Number.isFinite(t)) setHipFlexScoredAtMs(t)
  } catch { /* stay pre-cutover */ } finally { inflight = false }
}

/** Call in any component that shows a score or a hip flexion row: loads the cutover once and re-renders when it arrives. */
export function useHipFlexCutover(): number | null {
  useEffect(() => { void loadHipFlexScoredAt() }, [])
  return useSyncExternalStore(subscribeHipFlexScoredAt, hipFlexScoredAtMs, () => null)
}
