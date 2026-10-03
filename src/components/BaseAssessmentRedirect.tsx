import { useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { BASE_RETEST_URL, baseAssessmentUrl } from '../lib/utils'

// The standalone sport assessment wizard is retired: Base is the only app that
// assesses ROM. Anything that still points at /onboarding/assessment (old
// bookmarks, emails, cached links) is sent to Base here.
//   - signed in on this site: Base My Body (Base login first, then Retest or first assessment)
//   - signed out: the Base explainer page (romrx.io/bodybuilding), campaign params kept
export function BaseAssessmentRedirect() {
  const { session, loading } = useAuth()

  // Let useAuth finish consuming Supabase SSO / magic-link tokens first.
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')

  useEffect(() => {
    if (loading || hasAuthToken) return
    window.location.replace(session ? BASE_RETEST_URL : baseAssessmentUrl(window.location.search))
  }, [loading, session, hasAuthToken])

  return (
    <div className="min-h-screen flex items-center justify-center bg-miami-bg">
      <div className="w-8 h-8 border-4 border-miami border-t-transparent rounded-full animate-spin" />
    </div>
  )
}
