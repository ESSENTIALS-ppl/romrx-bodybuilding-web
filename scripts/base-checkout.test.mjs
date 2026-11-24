// P1-33 R1b/R2b: results button opens the $60 Base checkout with NO pack in the cart.
// Mocked fetch: asserts the exact URL, method, headers and body sent to create-checkout-session, the redirect on success,
// and that errors do not redirect. No network call is made.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import ts from 'typescript'
const code = readFileSync(new URL('../src/lib/baseCheckout.ts', import.meta.url), 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'bco-'))
writeFileSync(join(dir, 'b.mjs'), ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
const m = await import(pathToFileURL(join(dir, 'b.mjs')).href)
rmSync(dir, { recursive: true, force: true })

const URL_ = 'https://example.supabase.co/functions/v1/create-checkout-session'
const input = { url: URL_, accessToken: 'jwt-abc', anonKey: 'anon-xyz', userId: 'user-123', email: 'athlete@example.test' }
const mockFetch = (reply) => {
  const calls = []
  const f = async (url, init) => { calls.push({ url, init }); return { json: async () => reply } }
  return { f, calls }
}

// 1) success: exact request, then redirect to the Stripe URL
{
  const { f, calls } = mockFetch({ url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
  const redirects = []
  const r = await m.startBaseCheckout(input, f, (u) => redirects.push(u))
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, URL_)
  assert.equal(calls[0].init.method, 'POST')
  assert.deepEqual(calls[0].init.headers, { 'Content-Type': 'application/json', 'Authorization': 'Bearer jwt-abc', 'apikey': 'anon-xyz' })
  assert.equal(calls[0].init.body, '{"mode":"base","user_id":"user-123","email":"athlete@example.test"}')
  const body = JSON.parse(calls[0].init.body)
  assert.deepEqual(Object.keys(body).sort(), ['email', 'mode', 'user_id'])
  for (const k of ['plan', 'pending_sport', 'add', 'sport', 'price_id', 'token', 'lead_token', 'stripe_test_mode']) assert.ok(!(k in body), `no ${k} (no pack in cart)`)
  assert.deepEqual(redirects, ['https://checkout.stripe.com/c/pay/cs_test_1'])
  assert.deepEqual(r, { ok: true, url: 'https://checkout.stripe.com/c/pay/cs_test_1' })
}
// 2) server error: no redirect, server error passed through (same as before)
{
  const { f } = mockFetch({ error: 'base_checkout_unavailable', message: 'x' })
  const redirects = []
  const r = await m.startBaseCheckout(input, f, (u) => redirects.push(u))
  assert.deepEqual(redirects, []); assert.deepEqual(r, { ok: false, error: 'base_checkout_unavailable' })
}
// 3) empty reply: fallback message, no redirect
{
  const { f } = mockFetch({})
  const redirects = []
  const r = await m.startBaseCheckout(input, f, (u) => redirects.push(u))
  assert.deepEqual(redirects, []); assert.deepEqual(r, { ok: false, error: 'Payment setup failed. Please try again.' })
}
// 4) static guard: the results page uses the helper and no longer posts the rejected plan code
{
  const s = readFileSync(new URL('../src/pages/ResultsPreview.tsx', import.meta.url), 'utf8')
  assert.match(s, /import \{ startBaseCheckout \} from '\.\.\/lib\/baseCheckout'/)
  assert.match(s, /startBaseCheckout\(\s*\{ url: CHECKOUT_URL, accessToken: session\.access_token, anonKey: [^,]+, userId: user\.id, email: user\.email \?\? '' \}/)
  assert.doesNotMatch(s, /plan: 'athlete'/)
  assert.doesNotMatch(s, /pending_sport/)
  // Button only: the L1038 fine print keeps its $209 sentence until Kai's minimal edit clears (Grant, Nov 24).
  assert.doesNotMatch(s, /Get Base \+ ROMRx\w+ \(\$209\/yr\)/)
  assert.doesNotMatch(s, /Card required/)
  assert.match(s, /Get ROMRx Base \(\$60\/yr\)/)
}
console.log('base-checkout: ok')
