/**
 * Waitlist sign-up (React app). Static pages use public/waitlist.js; keep the URL and consent text in sync.
 * Contract (Avery, final): POST JSON { name, email, site, role, consent: true } to WAITLIST_URL.
 * Any 2xx = success (duplicates are also 2xx { ok: true }). Anything else, or a network error = error.
 * Do NOT send an apikey / Authorization header.
 */
export const WAITLIST_URL = 'https://cqzvqzwwevnflinxgnpp.supabase.co/functions/v1/join-waitlist'
export const WAITLIST_SITE = 'bb' as const

export type WaitlistRole = 'coach' | 'trainer' | 'gym' | 'school'

// Stacy's consent line (STACY-WAITLIST-COPY-20261028-1935). Render as: LEAD + <a href=URL>LINK_TEXT</a> + '.'
export const WAITLIST_CONSENT_LEAD =
  "We'll email you once to confirm, and again when coach tools open. Unsubscribe anytime. See our "
export const WAITLIST_CONSENT_LINK_TEXT = 'Privacy Policy'
export const WAITLIST_CONSENT_LINK_URL = 'https://romrx.io/legal'

export const WAITLIST_MSG_OK = "You're on the list. We'll email you to confirm."
export const WAITLIST_MSG_ERR = 'Something went wrong. Please try again, or email hello@romrx.io.'
export const WAITLIST_MSG_NAME = 'Please enter your name.'
export const WAITLIST_MSG_EMAIL = 'Please enter a valid email address.'

export function isValidWaitlistEmail(v: string): boolean {
  return v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)
}

/** Resolves true on any 2xx, false on any other status or a network error / timeout. */
export async function submitWaitlist(input: { name: string; email: string; role: WaitlistRole }): Promise<boolean> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), 15000)
  try {
    const res = await fetch(WAITLIST_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: input.name.trim(),
        email: input.email.trim(),
        site: WAITLIST_SITE,
        role: input.role,
        consent: true,
      }),
      signal: ctl.signal,
    })
    return res.status >= 200 && res.status < 300
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
