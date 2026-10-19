// Base-first buyers: a bodybuilding pack owner who never signed up on the BB site
// has an empty users.active_bb_tier, so unlocked_techniques_v returns 0 rows and the
// Generate tab and Exercise Library are dead. When that is the case we show a
// "Pick your level" card that calls the live RPC set_my_bb_tier. The buyer chooses;
// there is no auto-default level.
import type { Profile, SportEntitlement } from '../hooks/useProfile'
import { ownsSport } from './access'

// Same values set_my_bb_tier accepts (p_tier IN ('beginner','intermediate','advanced')).
export const BB_TIER_VALUES = ['beginner', 'intermediate', 'advanced'] as const
export type BbTierValue = typeof BB_TIER_VALUES[number]

export function isBbTier(t: string | null | undefined): t is BbTierValue {
  return (BB_TIER_VALUES as readonly string[]).includes(t ?? '')
}

/** True when the user owns bodybuilding but has no tier yet, so the picker card should show. */
export function needsBbTierPick(
  profile: Pick<Profile, 'active_bb_tier'> | null,
  entitlements: SportEntitlement[] | undefined,
  now = Date.now(),
): boolean {
  if (!profile) return false
  if (isBbTier(profile.active_bb_tier)) return false
  return ownsSport(entitlements, 'bodybuilding', now)
}

// Visible BB exercises per tier in unlocked_techniques_v (live data Oct 4: 88 beginner,
// 117 intermediate, 69 advanced; each tier also sees the tiers below it). Single source for the card copy.
export const BB_TIER_EXERCISE_COUNTS: Record<BbTierValue, number> = {
  beginner: 88,
  intermediate: 205,
  advanced: 274,
}

// Card copy, cleared by Stacy Oct 5. Counts come from BB_TIER_EXERCISE_COUNTS only.
export const BB_TIER_PICKER_HEADING = 'Pick your level'
export function bbTierPickerBody(counts: Record<BbTierValue, number> = BB_TIER_EXERCISE_COUNTS): string {
  return `Beginner unlocks ${counts.beginner} exercises, Intermediate ${counts.intermediate}, Advanced ${counts.advanced}.`
}
// Settings > Training Tier lets pack owners change it (set_my_bb_tier allows an active bodybuilding entitlement).
export const BB_TIER_PICKER_SETTINGS_NOTE = 'You can change it later in Settings.'
