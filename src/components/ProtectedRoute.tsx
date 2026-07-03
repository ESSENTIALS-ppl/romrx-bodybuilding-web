import { useEffect } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { SportProvider } from '../sports/SportProvider'
import { supabase } from '../lib/supabase'

// This is the romrxbodybuilding.com build — every authed page renders BB context,
// regardless of what the user's profile says. We also push BB into their profile
// so DB-side queries (e.g. unlocked_techniques_v) resolve correctly.
const SITE_SPORT = 'bodybuilding'

// Statuses that grant access to /dashboard/*. Mirrors BJJ's ProtectedRoute
// (see incident 2026-07-02). Trial access is allowed because Stripe issues
// 'trialing' only on a real Stripe trial with a payment method on file. The
// BB Signup path now writes 'pending' (not 'trialing'), so client-side signup
// can no longer bypass the paywall. Legacy pre-fix accounts are grandfathered
// via users.grandfathered_at (set by the 2026-07-02 backfill).
const PAID_STATUSES = new Set(['active', 'trialing'])

export function ProtectedRoute() {
  const { session, user, loading } = useAuth()
  const { profile, loading: profileLoading } = useProfile(user?.id)

  // Auto-sync: if a user logs into this site but their active_sport isn't BB, fix it.
  useEffect(() => {
    if (!user?.id || !profile) return
    const needsSwitch = profile.active_sport !== SITE_SPORT
    const needsEnable = !(profile.sports_enabled ?? []).includes(SITE_SPORT)
    if (!needsSwitch && !needsEnable) return

    const updates: Record<string, unknown> = {}
    if (needsSwitch) updates.active_sport = SITE_SPORT
    if (needsEnable) {
      updates.sports_enabled = Array.from(
        new Set([...(profile.sports_enabled ?? []), SITE_SPORT]),
      )
    }
    supabase.from('users').update(updates).eq('id', user.id).then(({ error }) => {
      if (error) console.warn('Auto-switch to BB sport failed:', error.message)
    })
  }, [user?.id, profile?.active_sport, profile?.sports_enabled])

  if (loading || (session && profileLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-miami-bg">
        <div className="w-8 h-8 border-4 border-miami border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Don't redirect if URL contains Supabase auth tokens — let AuthCallback handle it
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')
  if (hasAuthToken) return null

  if (!session) return <Navigate to="/login" replace />

  // Paywall gate. Anyone whose subscription_status isn't in PAID_STATUSES
  // gets routed to the assessment/checkout flow instead of the dashboard.
  // grandfathered_at exempts users who signed up before the paywall was
  // enforced on BB (see 2026-07-02 backfill).
  const grandfathered = Boolean((profile as { grandfathered_at?: string | null } | null)?.grandfathered_at)
  if (profile && !grandfathered && !PAID_STATUSES.has(profile.subscription_status)) {
    return <Navigate to="/onboarding/results" replace />
  }

  // Force BB context on this site — ignore profile.active_sport so a BJJ user landing here
  // immediately sees the BB dashboard instead of BJJ chrome.
  const sportsEnabled = profile?.sports_enabled ?? []
  const enabledWithBB = sportsEnabled.includes(SITE_SPORT)
    ? sportsEnabled
    : [...sportsEnabled, SITE_SPORT]

  return (
    <SportProvider
      userId={user?.id}
      activeSportSlug={SITE_SPORT}
      sportsEnabled={enabledWithBB}
    >
      <Outlet />
    </SportProvider>
  )
}
