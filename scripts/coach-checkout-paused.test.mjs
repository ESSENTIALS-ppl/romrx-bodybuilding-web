// Grant GO 2026-09-29: new coach checkouts paused. Static guard so the form can't quietly come back.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const s = readFileSync(new URL('../src/pages/CoachSignup.tsx', import.meta.url), 'utf8')
assert.match(s, /const COACH_CHECKOUT_OPEN = false/, 'flag must be false')
assert.match(s, /e\.preventDefault\(\)\n\s+if \(!COACH_CHECKOUT_OPEN\) return\n/, 'handleSubmit must bail before signUp/checkout')
assert.match(s, /if \(!COACH_CHECKOUT_OPEN\) return <CoachSignupPaused \/>/, 'page must render the paused panel')
const paused = s.slice(s.indexOf('function CoachSignupPaused'))
assert.ok(paused.length > 0, 'paused component exists')
assert.match(paused, /Not open during beta\./)
assert.doesNotMatch(paused, /\$\d|\/year|Spring 20|Cancel anytime|<form|signUp\(|CHECKOUT_URL|Continue to Payment/, 'paused panel: no price, dates, form or checkout')
assert.match(paused, /href="\/trainers"/)
console.log('coach-checkout-paused: ok')
