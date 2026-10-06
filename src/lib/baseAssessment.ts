// The assessment lives on Base (romrx.io) only. Jim, Oct 6 2026, CLOSED: the Base
// assessment is the single source of truth and no pack has its own assessment.
//
// Every "take / retake the assessment" entry point in this app goes to the romrx.io
// sign-in with a `next` that opens the Base assessment and, when done, comes back to
// this app's dashboard (romrx-io-web lib/packReturn.ts: return_to is a fixed key).
// Sessions do not carry across domains, so the member signs in on romrx.io with the
// same email and password (same account, same Supabase project). If they are already
// signed in there, romrx.io skips the form.
//
// The result is saved to the same `assessments` table this app reads (get_my_profile
// returns the latest row for the user, any sport), so My Game readiness colors and the
// program generator pick it up on the next load.
//
// Pure module (no imports) so scripts/base-assessment-redirect.test.mjs can load it.

export const PACK_KEY = 'bodybuilding'

export const BASE_ASSESSMENT_PATH = `/onboarding/assessment?return_to=${PACK_KEY}`

/** romrx.io sign-in, then the Base assessment, then back to romrxbodybuilding.com/dashboard/my-game. */
export const BASE_ASSESSMENT_HREF = `https://romrx.io/app/login?next=${encodeURIComponent(BASE_ASSESSMENT_PATH)}`

/** Same tab, so the return trip lands back in this app. */
export function goToBaseAssessment(): void {
  window.location.assign(BASE_ASSESSMENT_HREF)
}
