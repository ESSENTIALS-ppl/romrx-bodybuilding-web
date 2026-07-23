import { useEffect } from 'react'
import { BASE_ASSESSMENT_URL } from '../lib/utils'
import { Spinner } from '../components/Spinner'

// The standalone athlete signup has been retired. New athletes create their
// account inside ROMRx Base, so any hit on /signup (bookmarks, old campaigns,
// stale links) is redirected to the canonical Base explainer page. The target
// is a different host, so there is no redirect loop. Original query parameters
// are preserved so campaign attribution survives the hop.
export function Signup() {
  useEffect(() => {
    const target = BASE_ASSESSMENT_URL + window.location.search
    window.location.replace(target)
  }, [])

  return <Spinner />
}
