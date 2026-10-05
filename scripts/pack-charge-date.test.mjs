// Pack charge date guard. PACK_CHARGE_DATE_TEXT in src/pages/ResultsPreview.tsx is a placeholder until the date is confirmed
// (today, or January 1, 2027). This script runs before every build (prebuild) and as `npm run test:pack-date`.
// It FAILS when the placeholder is still present in a production build (Netlify CONTEXT=production) or when
// PACK_DATE_STRICT=1. In drafts, previews and local runs it passes but prints a loud warning.
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
const s = readFileSync(new URL('../src/pages/ResultsPreview.tsx', import.meta.url), 'utf8')
const m = s.match(/export const PACK_CHARGE_DATE_TEXT = '([^']*)'\n/)
assert.ok(m, 'PACK_CHARGE_DATE_TEXT constant must exist exactly once')
assert.equal(s.split('PACK_CHARGE_DATE_TEXT =').length, 2, 'declared once')
// Base-active small print: exact approved wording, date only via the constant.
assert.ok(
  s.includes('`Charged ${PACK_CHARGE_DATE_TEXT}, then every year until you cancel. Card required. Canceling Base also cancels ROMRxBodybuilding and ends your access right away. There are no refunds after a charge, except where the law requires one.`'),
  'Base-active small print must be the approved wording',
)
// No-Base branch stays as written.
assert.ok(s.includes('Base is required. Base $60/yr + ROMRxBodybuilding $149/yr = $209/yr. Charged January 1, 2027, then every year until you cancel. Card required. Canceling Base also cancels ROMRxBodybuilding.'), 'no-Base branch unchanged')
const placeholder = m[1] === '[DATE TO CONFIRM]' || /\[.*\]/.test(m[1]) || m[1].trim() === ''
const strict = process.env.CONTEXT === 'production' || process.env.PACK_DATE_STRICT === '1'
if (placeholder && strict) {
  console.error('FAIL pack-charge-date: PACK_CHARGE_DATE_TEXT is still the placeholder "' + m[1] + '". Confirm the charge date (today, or January 1, 2027) before a production build.')
  process.exit(1)
}
if (placeholder) console.warn('WARNING pack-charge-date: PACK_CHARGE_DATE_TEXT is still the placeholder (' + m[1] + '). A production build will FAIL until it is set.')
else assert.match(m[1], /^(today|January 1, 2027)$/, 'date text must be today or January 1, 2027')
console.log('pack-charge-date: ok')
