import { useEffect } from 'react'
import { baseAssessmentUrl } from '../lib/utils'
import { Spinner } from '../components/Spinner'

// The standalone athlete signup has been retired. New athletes create their
// account inside ROMRx Base, so any hit on /signup (bookmarks, old campaigns,
// stale links) is redirected to the canonical Base explainer page. The target
// is a different host, so there is no redirect loop. Only allowlisted campaign
// params are forwarded so attribution survives the hop without carrying
// arbitrary or sensitive query params across.
export function Signup() {
  useEffect(() => {
    window.location.replace(baseAssessmentUrl(window.location.search))
  }, [])

  return <Spinner />
}
