// My Protocol floors after the Oct 6 2026 minimums rescale (Jim YES 12:10 PM; Quinn calls 12:25 PM).
// normalMin / normalMax = Base target / Base displayed range; riskBelow = round(old riskBelow x new/old target);
// shoulder ER shows no range line (hideRange). Run: node scripts/minimums-rescale.test.mjs
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import ts from 'typescript'

const src = readFileSync(new URL('../src/pages/MyProtocol.tsx', import.meta.url), 'utf8')
const rows = [...src.matchAll(/normalMin: (\d+), normalMax: (\d+), riskBelow: (\d+), unit: '([^']*)', rxKey: '(\w+)',( hideRange: true,)?(?: rangeSource: '([^']*)',)?/g)]
const defs = Object.fromEntries(rows.map(m => [m[5], [Number(m[1]), Number(m[2]), Number(m[3])]]))
const JOINTS = rows.map(m => ({ key: m[5], normalMin: Number(m[1]), normalMax: Number(m[2]), unit: m[4], ...(m[6] ? { hideRange: true } : {}), ...(m[7] ? { rangeSource: m[7] } : {}) }))

// 1) values: [normalMin, normalMax, riskBelow]
const EXPECTED = { hip_er: [29, 43, 26], hip_ir: [26, 40, 17], shoulder_er: [85, 110, 57], shoulder_flex: [140, 180, 93], ankle_df: [6, 13, 3], cervical_lat: [38, 53, 25] }
const UNCHANGED = { hip_abd: [35, 45, 25], cervical_flex: [45, 60, 35], cervical_ext: [55, 70, 40], lumbar: [40, 80, 40], thoracic_rot: [40, 60, 30] }
for (const [k, v] of Object.entries(EXPECTED)) assert.deepEqual(defs[k], v, `${k} = ${v}`)
for (const [k, v] of Object.entries(UNCHANGED)) assert.deepEqual(defs[k], v, `${k} not changed`)
assert.equal(Object.keys(defs).length, Object.keys(EXPECTED).length + Object.keys(UNCHANGED).length, 'every My Protocol joint is pinned')

// 2) riskBelow = round(old riskBelow x new/old target) (Quinn item 4: riskBelow stays ratio-scaled; SLR now 60/120)
const OLD = { hip_er: [40, 60, 40], hip_ir: [30, 45, 30], shoulder_er: [60, 90, 60], shoulder_flex: [140, 180, 120], ankle_df: [10, 20, 10], cervical_lat: [40, 45, 30] }
const RAT = { hip_er: [29, 45], hip_ir: [26, 45], shoulder_er: [85, 90], shoulder_flex: [140, 180], ankle_df: [6, 20], cervical_lat: [38, 45] }
for (const [k, o] of Object.entries(OLD)) assert.equal(defs[k][2], Math.round(o[2] * RAT[k][0] / RAT[k][1]), `${k} riskBelow ratio-scaled`)

// 3) range line: suppressed for shoulder ER only
const lib = readFileSync(new URL('../src/lib/protocolRange.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(lib, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText
const { rangeText, sourceText } = await import('data:text/javascript,' + encodeURIComponent(js))
assert.deepEqual(JOINTS.filter(j => j.hideRange).map(j => j.key), ['shoulder_er'], 'only shoulder ER hides its range')
for (const j of JOINTS) {
  if (j.key === 'shoulder_er') assert.equal(rangeText(j), null, 'shoulder ER: no range line')
  else assert.equal(rangeText(j), `${j.normalMin}–${j.normalMax}${j.unit}`, `${j.key} range line still shown`)
}
assert.equal(rangeText(JOINTS.find(j => j.key === 'shoulder_flex')), '140–180°')
assert.equal(defs.hip_flex, undefined, 'hip flexion is not a My Protocol joint (hip display: saved per leg, not ranked)')
assert.equal(rangeText(JOINTS.find(j => j.key === 'ankle_df')), '6–13cm')
// the card renders the range only through rangeText() and skips the whole box when it is null
assert.ok(!/\{def\.normalMin\}–\{def\.normalMax\}/.test(src), 'no direct min–max render left')
assert.match(src, /\{rangeText\(def\) !== null && \(\s*<div className="bg-surface rounded-xl px-3 py-1\.5">\s*<p [^>]*>Typical range<\/p>\s*<p [^>]*>\{rangeText\(def\)\}<\/p>/, 'range box gated on rangeText(def)')

// 4) Stacy PASS wording (Oct 6 12:29 PM): no 'Normal' label left on the card
assert.match(src, /uppercase tracking-wide">Typical range<\/p>/, 'range box heading = Typical range')
assert.match(src, /uppercase tracking-wide">Below typical range<\/p>/, 'red tile = Below typical range')
assert.ok(!/>\s*(Below )?Normal\s*</.test(src), 'no rendered Normal / Below Normal label')
assert.match(src, /If this is hard, that is normal\./, '90/90 cue kept as is')

// 5) source line under the range = Base rangeSource (io assessmentSteps1.ts / hipFlexCopy.ts); none where Base has none
const SOURCES = { hip_er: 'Source: Simoneau et al., 1998', hip_ir: 'Source: Simoneau et al., 1998', shoulder_flex: 'Source: Gill et al., 2020' }
for (const j of JOINTS) assert.equal(sourceText(j), SOURCES[j.key] ?? null, `${j.key} source line`)
assert.equal(sourceText({ normalMin: 40, normalMax: 75, unit: '°', hideRange: true, rangeSource: 'Gill et al., 2020' }), null, 'hidden range never shows a source')
assert.match(src, /\{rangeText\(def\)\}<\/p>\s*\{sourceText\(def\) !== null && <p [^>]*>\{sourceText\(def\)\}<\/p>\}\s*<\/div>\s*\)\}/, 'source line sits inside the gated range box')
console.log('minimums-rescale tests: ok')
