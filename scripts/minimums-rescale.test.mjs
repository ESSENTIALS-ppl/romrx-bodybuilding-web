// Pack MyProtocol floors follow the Oct 6 2026 minimums rescale (Jim YES 12:10 PM; Quinn): new = round(old x new target / old target).
// Run: node scripts/minimums-rescale.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/pages/MyProtocol.tsx', import.meta.url), 'utf8')
const defs = Object.fromEntries([...src.matchAll(/normalMin: (\d+), normalMax: (\d+), riskBelow: (\d+), unit: '[^']*', rxKey: '(\w+)'/g)]
  .map(m => [m[4], [Number(m[1]), Number(m[2]), Number(m[3])]]))
const RAT = { hip_er: [29, 45], hip_ir: [26, 45], hip_flex: [63, 120], shoulder_flex: [140, 180], ankle_df: [6, 20], cervical_rot: [70, 80], cervical_lat: [38, 45] }
// old (pre-rescale) floors on main, normalMin / normalMax / riskBelow
const OLD = { hip_er: [40, 60, 40], hip_ir: [30, 45, 30], hip_flex: [100, 120, 100], shoulder_flex: [140, 180, 120], ankle_df: [10, 20, 10], cervical_lat: [40, 45, 30] }
const UNCHANGED = { hip_abd: [35, 45, 25], shoulder_er: [60, 90, 60], cervical_flex: [45, 60, 35], cervical_ext: [55, 70, 40], lumbar: [40, 80, 40], thoracic_rot: [40, 60, 30] }
for (const [k, old] of Object.entries(OLD)) {
  const [n, d] = RAT[k]
  assert.deepEqual(defs[k], old.map(v => Math.round(v * n / d)), `${k} rescaled x ${n}/${d}`)
}
for (const [k, v] of Object.entries(UNCHANGED)) assert.deepEqual(defs[k], v, `${k} not rescaled`)
assert.equal(Object.keys(defs).length, Object.keys(OLD).length + Object.keys(UNCHANGED).length, 'every MyProtocol joint is pinned')
console.log('minimums-rescale tests: ok')
