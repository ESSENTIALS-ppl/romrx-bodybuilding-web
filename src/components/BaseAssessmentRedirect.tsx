import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { baseAssessmentUrl } from '../lib/utils'
import { BASE_ASSESSMENT_HREF } from '../lib/baseAssessment'

// /onboarding/assessment. The standalone BB assessment is retired (Jim, Oct 6 2026):
// the Base assessment on romrx.io is the only assessment. Old bookmarks and any
// in-app link still land on this path:
//   - signed in here: romrx.io sign-in -> Base assessment -> back to My Game
//   - signed out: the Base explainer (romrx.io/bodybuilding), allowlisted campaign
//     params kept. That is the Base-first new-member path (sign up, assess, add BB).
// Rollback: put <Route path="/onboarding/assessment" element={<Assessment />} />
// back inside <OnboardingGuard> in App.tsx (pages/Assessment.tsx is kept, unrouted).
export function BaseAssessmentRedirect() {
  const { session, loading } = useAuth()

  // Let useAuth finish consuming SSO / magic-link tokens before deciding.
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')

  useEffect(() => {
    if (loading || hasAuthToken) return
    window.location.replace(session ? BASE_ASSESSMENT_HREF : baseAssessmentUrl(window.location.search))
  }, [loading, session, hasAuthToken])

  return (
    <div className="min-h-screen flex items-center justify-center bg-miami-bg">
      <div className="w-8 h-8 border-4 border-miami border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
