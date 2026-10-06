import { supabase } from './supabase'

/**
 * Terms acceptance record (Stacy ruling Oct 5 2026, PASS on romrx-io-web #147; BJJ/BB scope Oct 5).
 *
 * The romrx.io/legal page holds Terms, Privacy and Refund. The not-medical-advice / train-at-your-own-choice
 * (waiver) language is Terms section 3 on that page, accepted by the same checkbox, so one version string
 * covers terms and waiver. Change it whenever the /legal "Effective" date changes, together with
 * public.current_terms_version() and romrx-io-web app/src/lib/termsConsent.ts.
 *
 * Records are written by the database, never by a client insert that can fail silently:
 *  - account creation: signUp metadata + the auth.users trigger (fails closed: no record, no account)
 *  - re-accept screen: public.record_terms_reaccept (server timestamp, signed-in user only)
 * No IP address is recorded.
 */
export const TERMS_VERSION = '2026-10-03'
export const MEDICAL_WAIVER_VERSION = TERMS_VERSION

/** Re-accept screen shows the romrx.io signup checkbox text exactly, so it shares that wording id. */
export const REACCEPT_CONSENT_TEXT_VERSION = 'signup-checkbox-2026-10-05'
export const REACCEPT_CONSENT_SOURCE = 'romrxbodybuilding.com/app/reaccept'

/** BB coach signup shows its own checkbox wording (links romrx.io/legal), so it has its own id. */
export const COACH_SIGNUP_CONSENT_TEXT_VERSION = 'bb-coach-signup-checkbox-2026-10-05'
export const COACH_SIGNUP_CONSENT_SOURCE = 'romrxbodybuilding.com/coach-signup'

export function clipUserAgent(ua: string | undefined | null): string {
  return (ua ?? '').slice(0, 512)
}

/** signUp metadata keys the auth.users trigger reads. Only sent when the box was checked. */
export function coachSignupConsentMetadata(agreedToTerms: boolean, userAgent: string | undefined | null) {
  if (!agreedToTerms) return {}
  return {
    terms_accepted: true,
    terms_version: TERMS_VERSION,
    consent_text_version: COACH_SIGNUP_CONSENT_TEXT_VERSION,
    consent_source: COACH_SIGNUP_CONSENT_SOURCE,
    consent_user_agent: clipUserAgent(userAgent),
  } as const
}

/**
 * Re-accept gate flag. Default OFF. Production: VITE_TERMS_REACCEPT_GATE=on (Sunday batch, after the
 * migration). Non-production hosts only: ?reaccept_gate=1 latches it on for this tab for review.
 */
export const REACCEPT_GATE_LATCH_KEY = 'romrx.reacceptGatePreview'
export function isReacceptGateEnabled(
  envFlag: string | undefined,
  hostname: string,
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null,
): boolean {
  if ((envFlag ?? '').toLowerCase() === 'on') return true
  if (hostname === 'romrxbodybuilding.com' || hostname === 'www.romrxbodybuilding.com') return false
  try {
    if (new URLSearchParams(search).get('reaccept_gate') === '1') storage?.setItem(REACCEPT_GATE_LATCH_KEY, '1')
    return storage?.getItem(REACCEPT_GATE_LATCH_KEY) === '1'
  } catch {
    return false
  }
}

/** Routes where the gate never shows (signed-out flows, auth hops, opt-out and share links). */
export function reacceptGateSkipsPath(pathname: string): boolean {
  const p = pathname.replace(/\/+$/, '') || '/'
  return ['/login', '/signup', '/auth/callback', '/auth/confirm', '/unsubscribe', '/game'].some(
    (x) => p === x || p.startsWith(x + '/'),
  )
}

/** Records the re-accept through the server function. Returns false if it could not be saved. */
export async function recordTermsReaccept(userAgent: string | undefined | null): Promise<boolean> {
  const { error } = await supabase.rpc('record_terms_reaccept', {
    p_terms_version: TERMS_VERSION,
    p_consent_text_version: REACCEPT_CONSENT_TEXT_VERSION,
    p_source: REACCEPT_CONSENT_SOURCE,
    p_user_agent: clipUserAgent(userAgent),
  })
  return !error
}
