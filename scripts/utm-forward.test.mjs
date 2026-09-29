// node scripts/utm-forward.test.mjs : unit checks for public/utm-forward.js
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const SRC = readFileSync(join(fileURLToPath(import.meta.url), '..', '..', 'public', 'utm-forward.js'), 'utf8');

function load(search, stored = null) {
  const store = new Map(stored ? [['romrx.inbound_params', JSON.stringify(stored)]] : []);
  const window = { location: { search, href: 'https://site.example/page' + search } };
  const ctx = {
    window, URL, URLSearchParams, JSON,
    sessionStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) },
    document: { readyState: 'loading', addEventListener() {}, documentElement: {} },
  };
  vm.runInNewContext(SRC, ctx);
  return { api: window.__romrxUtmForward, store };
}
const OWNED = 'https://romrx.io/bjj?utm_campaign=ROMRx_Base_Beta_2026&utm_source=owned&utm_medium=site&utm_content=X&utm_term=hero_cta';

// 1. Bare landing: nothing incoming, fixed tags untouched.
{ const { api, store } = load('');
  assert.equal(api.incoming.length, 0);
  assert.equal(api.rewrite(OWNED, api.incoming), null);
  assert.equal(store.size, 0); }

// 2. IG bio landing: incoming replaces ALL fixed utm_* (no mixing), saved to sessionStorage.
{ const { api, store } = load('?utm_source=owned&utm_medium=ig_bio&utm_content=20260929_owned_ig_bio_bjj_utm&ref=x');
  assert.equal(JSON.stringify(api.incoming), JSON.stringify([['utm_source','owned'],['utm_medium','ig_bio'],['utm_content','20260929_owned_ig_bio_bjj_utm']]));
  assert.ok(store.has('romrx.inbound_params'));
  const out = api.rewrite(OWNED, api.incoming);
  assert.equal(out, 'https://romrx.io/bjj?utm_source=owned&utm_medium=ig_bio&utm_content=20260929_owned_ig_bio_bjj_utm');
  assert.ok(!out.includes('utm_term') && !out.includes('utm_campaign')); }

// 3. Stored copy survives in-site navigation (URL now bare).
{ const { api } = load('', [['utm_source','ig'],['fbclid','ABC']]);
  assert.equal(api.rewrite('https://romrx.io/legal#do-not-sell', api.incoming), 'https://romrx.io/legal?utm_source=ig&fbclid=ABC#do-not-sell'); }

// 4. Only romrx.io hosts are rewritten; other params on the link are kept; values URL-encoded.
{ const { api } = load('?utm_campaign=a%20b%26c&fbclid=Z');
  assert.equal(api.rewrite('https://evil.example/?x=1', api.incoming), null);
  assert.equal(api.rewrite('https://notromrx.io/bjj', api.incoming), null);
  assert.equal(api.rewrite('/athletes', api.incoming), null);
  assert.equal(api.rewrite('mailto:hi@romrx.io', api.incoming), null);
  assert.equal(api.rewrite('https://www.romrx.io/app/signup?add=bjj&utm_term=nav_cta', api.incoming),
    'https://www.romrx.io/app/signup?add=bjj&utm_campaign=a+b%26c&fbclid=Z'); }

// 5. Idempotent: already-forwarded href is not rewritten again.
{ const { api } = load('?utm_source=ig');
  const once = api.rewrite(OWNED, api.incoming);
  assert.equal(api.rewrite(once, api.incoming), null); }

console.log('utm-forward: all checks passed');
