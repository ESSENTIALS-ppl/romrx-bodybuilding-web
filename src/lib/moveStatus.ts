// Per-joint G/Y/R for each move. SINGLE SOURCE = the server rule (compute-tiers v43 writes technique_eligibility).
// The app does not recompute colors: no best-side, no 90/75 bands, no percentage score.
// Rule (Jim): each joint is GREEN/YELLOW/RED against that move's requirement; the move takes the worst measured
// required joint; no rule or an unmeasured required joint is GREY (never GREEN).
// This supersedes the unwired helper in bb-web #39 (src/lib/verdict.ts), which encoded the older server rule.
import { supabase } from './supabase'

export type MoveTier = 'GREEN' | 'YELLOW' | 'RED' | 'GREY'
export interface JointStatus { joint: string; status: MoveTier }
export interface MoveStatus { tier: MoveTier; reason: string | null; joints: JointStatus[] }
export type MoveStatusMap = Map<string, MoveStatus>

const TIERS: MoveTier[] = ['GREEN', 'YELLOW', 'RED', 'GREY']
const asTier = (v: unknown): MoveTier => (TIERS.includes(v as MoveTier) ? (v as MoveTier) : 'GREY')

interface Row {
  technique_code: string | null
  tier: string
  joint_status?: { joint: string; status: string }[] | null
  status_reason?: string | null
}

export function buildStatusMap(rows: Row[]): MoveStatusMap {
  const map: MoveStatusMap = new Map()
  for (const r of rows) {
    if (!r.technique_code || map.has(r.technique_code)) continue // rows arrive newest first
    map.set(r.technique_code, {
      tier: asTier(r.tier),
      reason: r.status_reason ?? null,
      joints: (r.joint_status ?? []).map(j => ({ joint: j.joint, status: asTier(j.status) })),
    })
  }
  return map
}

export async function fetchMoveStatuses(userId: string): Promise<MoveStatusMap> {
  const full = await supabase
    .from('technique_eligibility')
    .select('technique_code, tier, joint_status, status_reason, computed_at')
    .eq('user_id', userId)
    .eq('sport', 'bodybuilding')
    .order('computed_at', { ascending: false })
  if (!full.error) return buildStatusMap((full.data ?? []) as Row[])
  // Before the server migration lands the two new columns do not exist: fall back to tier only.
  const legacy = await supabase
    .from('technique_eligibility')
    .select('technique_code, tier, computed_at')
    .eq('user_id', userId)
    .eq('sport', 'bodybuilding')
    .order('computed_at', { ascending: false })
  return buildStatusMap((legacy.data ?? []) as Row[])
}

// Words (Stacy: plain, no medical claims). GREY means we cannot rate the move yet.
export const TIER_WORD: Record<MoveTier, string> = {
  GREEN: 'Ready',
  YELLOW: 'Caution',
  RED: 'Mobility first',
  GREY: 'Not rated',
}

export const GREY_REASON_WORD: Record<string, string> = {
  no_rule: 'No range requirement set for this move',
  incomplete: 'Some required joints are not measured yet',
}

export const tierBorder = (t: MoveTier | null): string =>
  t === 'GREEN' ? 'border-l-4 border-green-tier'
  : t === 'YELLOW' ? 'border-l-4 border-yellow-tier'
  : t === 'RED' ? 'border-l-4 border-red-tier'
  : 'border-l-4 border-miami-violet/40'

export const tierText = (t: MoveTier | null): string =>
  t === 'GREEN' ? 'text-green-tier' : t === 'YELLOW' ? 'text-yellow-tier' : t === 'RED' ? 'text-red-tier' : 'text-miami-text/50'

export const tierChip = (t: MoveTier | null): string =>
  t === 'GREEN' ? 'bg-green-tier-bg text-green-tier'
  : t === 'YELLOW' ? 'bg-yellow-tier-bg text-yellow-tier'
  : t === 'RED' ? 'bg-red-tier-bg text-red-tier'
  : 'bg-miami-violet/15 text-miami-text/70'

export function jointName(key: string): string {
  return key.replace(/_/g, ' ')
}
