// P1-33 R1b/R2b: the results-page button opens the $60 Base checkout with NO pack in the cart.
// create-checkout-session (romrxbjj-v2, live v50) takes a Base-only request as { mode: 'base', user_id, email }
// with the signed-in session token; the JWT user id must equal user_id (401 auth_required otherwise).
// No plan, pending_sport, add, sport or price_id is sent, so the sport pack gate passes and Stripe gets the Base price only.
// The old body { email, plan: 'athlete' } had no mode and was rejected with 400 "Invalid mode".

export type BaseCheckoutInput = {
  url: string
  accessToken: string
  anonKey: string
  userId: string
  email: string
}

export type BaseCheckoutResult = { ok: true; url: string } | { ok: false; error: string }

export const BASE_CHECKOUT_FALLBACK_ERROR = 'Payment setup failed. Please try again.'

export function buildBaseCheckoutRequest(i: BaseCheckoutInput): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${i.accessToken}`,
      'apikey': i.anonKey,
    },
    body: JSON.stringify({ mode: 'base', user_id: i.userId, email: i.email }),
  }
}

export async function startBaseCheckout(
  i: BaseCheckoutInput,
  fetchImpl: typeof fetch,
  redirect: (url: string) => void,
): Promise<BaseCheckoutResult> {
  const res = await fetchImpl(i.url, buildBaseCheckoutRequest(i))
  const { url, error } = (await res.json()) as { url?: string; error?: string }
  if (url) { redirect(url); return { ok: true, url } }
  return { ok: false, error: error ?? BASE_CHECKOUT_FALLBACK_ERROR }
}
