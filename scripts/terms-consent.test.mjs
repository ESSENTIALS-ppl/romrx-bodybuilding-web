// node scripts/terms-consent.test.mjs : terms acceptance record + re-accept gate (Stacy, Oct 5 2026)
import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const ROOT = join(fileURLToPath(import.meta.url), '..', '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const flat = (s) => s.replace(/\{' '\}/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ');
const terms = read('src/lib/terms.ts');
const gate = read('src/components/TermsReacceptGate.tsx');
const app = read('src/App.tsx');
const login = read('src/pages/Login.tsx');
const CHECKBOX = 'I have read and agree to the ROMRx LLC Terms of Service, Privacy Policy & Refund Policy , a company-wide agreement with ROMRx LLC and its products.';
let n = 0; const ok = (name) => { n++; console.log('PASS:', name); };

// versions
assert.match(terms, /export const TERMS_VERSION = '2026-10-03'/);
assert.match(terms, /export const MEDICAL_WAIVER_VERSION = TERMS_VERSION/);
assert.match(terms, /Terms section 3/);
assert.doesNotMatch(terms, /Sections 5 & 6/);
assert.match(terms, /export const REACCEPT_CONSENT_TEXT_VERSION = 'signup-checkbox-2026-10-05'/);
assert.match(terms, /export const REACCEPT_CONSENT_SOURCE = 'romrxbodybuilding.com\/app\/reaccept'/);
ok('versions 2026-10-03 (terms = waiver, Terms section 3), re-accept source romrxbodybuilding.com/app/reaccept');

// no client insert into consents anywhere, no IP capture
const srcFiles = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap(e => e.isDirectory() ? srcFiles(join(d, e.name)) : [join(d, e.name)]);
for (const f of srcFiles('src')) {
  const s = read(f);
  assert.doesNotMatch(s, /from\('consents'\)\.insert/, f);
  assert.doesNotMatch(s, /recordConsent\(/, f);
}
assert.doesNotMatch(terms, /ip_address|x-forwarded-for|submit-consent/);
ok('no direct client insert into consents, no recordConsent, no IP path');

// gate: flag off by default, never on the production host via the query param
const enabledFn = terms.slice(terms.indexOf('export function isReacceptGateEnabled'), terms.indexOf('/** Routes where the gate never shows'));
assert.match(enabledFn, /if \(\(envFlag \?\? ''\)\.toLowerCase\(\) === 'on'\) return true/);
assert.match(enabledFn, /if \(hostname === 'romrxbodybuilding.com' \|\| hostname === 'www\.romrxbodybuilding.com'\) return false/);
ok('gate default OFF; ?reaccept_gate=1 ignored on romrxbodybuilding.com');

// gate copy and checkbox behavior
assert.ok(gate.includes('Please confirm your agreement to continue.'));
assert.ok(flat(gate).includes(CHECKBOX), 'gate checkbox text equals romrx.io signup text');
assert.match(gate, /<a href="https:\/\/romrx\.io\/legal"[^>]*>\s*Terms of Service, Privacy Policy & Refund Policy\s*<\/a>/);
assert.match(gate, /\n\s*Continue\n/);
assert.ok(gate.includes('Sign out'));
assert.ok(gate.includes(`"We couldn't save that. Please try again."`));
assert.ok(gate.includes('const [agreed, setAgreed] = useState(false)'));
assert.equal((gate.match(/setAgreed\(/g) || []).length, 1);
assert.doesNotMatch(gate, /defaultChecked|setAgreed\(true\)/);
assert.ok(gate.includes('disabled={!agreed || saving}'));
assert.ok(gate.includes(".eq('terms_version', TERMS_VERSION)"));
assert.match(terms, /supabase\.rpc\('record_terms_reaccept'/);
assert.ok(app.includes('<TermsReacceptGate />'));
ok('gate: Stacy copy exactly, unchecked, user tap only, current version, server RPC, mounted');

// magic link never creates an account
assert.ok(login.includes('shouldCreateUser: false'));
assert.ok(login.includes(`"We couldn't find an account for that email."`));
ok('magic link: shouldCreateUser false');

// BB coach signup: server-side record, links romrx.io/legal, own wording id
const coach = read('src/pages/CoachSignup.tsx');
assert.match(coach, /<a href="https:\/\/romrx\.io\/legal"/);
assert.match(terms, /export const COACH_SIGNUP_CONSENT_TEXT_VERSION = 'bb-coach-signup-checkbox-2026-10-05'/);
assert.match(terms, /export const COACH_SIGNUP_CONSENT_SOURCE = 'romrxbodybuilding\.com\/coach-signup'/);
const data = coach.slice(coach.indexOf('supabase.auth.signUp('), coach.indexOf("if (signUpErr)"));
assert.ok(data.includes('...coachSignupConsentMetadata(agreedToTerms, navigator.userAgent),'));
assert.match(coach, /const \[agreedToTerms, setAgreedToTerms\]\s+= useState\(false\)/);
assert.match(coach, /disabled=\{loading \|\| !agreedToTerms\}/);
const meta = terms.slice(terms.indexOf('export function coachSignupConsentMetadata'), terms.indexOf('/**', terms.indexOf('export function coachSignupConsentMetadata')));
assert.match(meta, /if \(!agreedToTerms\) return \{\}/);
for (const k of ['terms_accepted: true', 'terms_version: TERMS_VERSION', 'consent_text_version: COACH_SIGNUP_CONSENT_TEXT_VERSION', 'consent_source: COACH_SIGNUP_CONSENT_SOURCE', 'consent_user_agent: clipUserAgent(userAgent)']) assert.ok(meta.includes(k), k);
ok('BB coach signup: metadata + trigger (fails closed), romrx.io/legal, bb-coach-signup-checkbox-2026-10-05');
console.log(`${n} terms-consent checks passed.`);
