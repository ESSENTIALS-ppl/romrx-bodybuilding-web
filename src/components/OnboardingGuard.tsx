import { useEffect } from 'react'
import { Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { BASE_ASSESSMENT_URL } from '../lib/utils'

// Auth gate for the public-facing onboarding routes (/onboarding/assessment and
// /onboarding/results). These pages used to render for anyone, so an
// unauthenticated visitor hitting the URL directly could load the full
// assessment without ever going through ROMRx Base. New-athlete acquisition
// must happen in Base, so an unauthenticated visitor is sent there. A visitor
// with a valid session keeps access, which preserves legitimate retest and
// results review for existing athletes.
//
// We intentionally gate in React rather than with a Netlify force redirect: a
// static 301/302 on /onboarding/* would also bounce authenticated retests. The
// Netlify config keeps /onboarding/* as a 200 SPA rewrite so this guard can make
// the auth-aware decision.
export function OnboardingGuard() {
  const { session, loading } = useAuth()

  // While a Base SSO hand-off is in flight the tokens live in the URL and
  // useAuth has not resolved the session yet. Mirror ProtectedRoute: hold the
  // redirect until useAuth consumes the hash, otherwise we would bounce a user
  // who is mid sign-in.
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')

  useEffect(() => {
    if (loading || hasAuthToken) return
    if (!session) window.location.replace(BASE_ASSESSMENT_URL)
  }, [loading, hasAuthToken, session])

  if (loading || hasAuthToken || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-miami-bg">
        <div className="w-8 h-8 border-4 border-miami border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return <Outlet />
}
