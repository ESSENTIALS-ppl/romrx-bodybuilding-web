// F-02: who may open /dashboard/* on a sport site.
// The old rule read users.subscription_status only. Buying a sport pack never sets it,
// so pack holders were bounced to a dead paywall. New rule: Base is active AND the
// user owns this sport (an active or trialing sport_entitlements row that has not expired).
// The legacy subscription_status rule still grants access. BB route keeps its own grandfathered_at bypass; BJJ never had one, so none is added here.
import type { Profile, SportEntitlement } from '../hooks/useProfile'

const LEGACY_PAID = new Set(['active', 'trialing'])
const LIVE_ENTITLEMENT = new Set(['active', 'trialing'])

export function ownsSport(entitlements: SportEntitlement[] | undefined, sport: string, now = Date.now()): boolean {
  return (entitlements ?? []).some(
    (e) =>
      e.sport === sport &&
      LIVE_ENTITLEMENT.has(e.status) &&
      (!e.expires_at || new Date(e.expires_at).getTime() > now),
  )
}

export function hasSportAccess(
  profile: Profile | null,
  entitlements: SportEntitlement[] | undefined,
  sport: string,
): boolean {
  if (!profile) return false
  if (LEGACY_PAID.has(profile.subscription_status)) return true
  return profile.base_status === 'active' && ownsSport(entitlements, sport)
}
