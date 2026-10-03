import { useEffect } from 'react'
import { Spinner } from './Spinner'
import { BASE_RETEST_URL } from '../lib/utils'

// Wizard retirement (DRAFT): any hit on /onboarding/assessment (old emails,
// bookmarks, in-app links) goes to the Base assessment. The query string is
// forwarded so campaign parameters survive. Target is an external origin, so
// there is no same-app redirect loop.
export function BaseAssessmentRedirect() {
  useEffect(() => {
    window.location.replace(`${BASE_RETEST_URL}${window.location.search}`)
  }, [])
  return <Spinner />
}
