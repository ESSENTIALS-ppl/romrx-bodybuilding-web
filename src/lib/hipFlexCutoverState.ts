// FG-36 cutover state (pure, no network): the time hip flexion started to be scored, read at runtime from
// public.scoring_cutovers (key 'hip_flex_scored') by ./hipFlexCutover.ts. null = unknown or row missing = treat EVERYTHING as
// pre-cutover (hip flexion unscored, old 9-joint scoring). Never guess a date.
let scoredAtMs: number | null = null
const listeners = new Set<() => void>()
export function hipFlexScoredAtMs(): number | null { return scoredAtMs }
export function setHipFlexScoredAtMs(v: number | null): void {
  if (v === scoredAtMs) return
  scoredAtMs = v
  listeners.forEach(f => f())
}
export function subscribeHipFlexScoredAt(f: () => void): () => void {
  listeners.add(f)
  return () => { listeners.delete(f) }
}

/** true when hip flexion counts for this assessment: the cutover is known and the assessment was saved at or after it. */
export function hipFlexScoredFor(a: object): boolean {
  const cut = scoredAtMs
  if (cut == null) return false
  const rec = a as Record<string, unknown>
  const t = Date.parse(String(rec.assessed_at ?? rec.created_at ?? ''))
  if (!Number.isFinite(t)) return true // no timestamp = a just-saved assessment; old rows always carry one
  return t >= cut
}
