import { supabase } from './supabase'

// Bump this string whenever the /legal Terms of Service are materially updated.
// It is stored on each consent row so we have a timestamped record of exactly
// which version of the ROMRx LLC agreement a user accepted.
export const TERMS_VERSION = '2026-06-04'

// The medical waiver / assumption-of-risk language lives in the same /legal
// document (Sections 5 & 6), so it shares the Terms version.
export const MEDICAL_WAIVER_VERSION = '2026-06-04'

/**
 * Records a user's acceptance of the ROMRx LLC Terms of Service, Privacy Policy,
 * Refund Policy, and medical/assumption-of-risk waiver.
 *
 * Writes a row to public.consents (RLS: a user may only insert their own row).
 * Fire-and-forget friendly: errors are logged but never block account creation,
 * because the signup UI already hard-gates submission on the agree checkbox.
 */
export async function recordConsent(params: {
  userId: string
  signedName: string
}): Promise<void> {
  try {
    const { error } = await supabase.from('consents').insert({
      user_id: params.userId,
      terms_version: TERMS_VERSION,
      medical_waiver_version: MEDICAL_WAIVER_VERSION,
      signed_name: params.signedName,
      user_agent:
        typeof navigator !== 'undefined' ? navigator.userAgent : null,
      // ip_address is captured server-side (it is not reliably available in the
      // browser); leaving it null here is expected.
    })
    if (error) console.error('recordConsent failed:', error.message)
  } catch (e) {
    console.error('recordConsent threw:', e)
  }
}
