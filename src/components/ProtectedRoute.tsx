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

export function ProtectedRoute() {
  const { session, user, loading } = useAuth()
  const { profile } = useProfile(user?.id)

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

  if (loading) {
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
