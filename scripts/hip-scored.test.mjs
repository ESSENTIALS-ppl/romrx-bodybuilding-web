// node scripts/hip-scored.test.mjs : hip flexion is SCORED (target 120) and the pack uses the Base /100 score and Base bands (FG-37 J1/J2, paired with FG-36).
// Unit checks on src/lib/hipFlex.ts + src/lib/readiness.ts + src/lib/mobilityBands.ts (transpiled with the repo's TypeScript), plus source checks on the pages.
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'hipflex-'));
async function load(rel) {
  const out0 = ts.transpileModule(src(rel), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const out = out0.replace(/from '\.\/(mobilityBands|lumbarFlag|hipFlexCutoverState)'/g, "from './src_lib_$1.mjs'");
  const f = join(tmp, rel.replace(/[\/]/g, '_').replace(/\.ts$/, '.mjs'));
  writeFileSync(f, out);
  return import(pathToFileURL(f).href);
}
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', n, name); };
const hip = await load('src/lib/hipFlex.ts');
await load('src/lib/lumbarFlag.ts');
const st = await load('src/lib/hipFlexCutoverState.ts');
// The real cutover is read at runtime from scoring_cutovers; the test injects one.
const CUT = Date.parse('2026-11-03T00:00:00Z');
st.setHipFlexScoredAtMs(CUT);
const mb = await load('src/lib/mobilityBands.ts');
const rd = await load('src/lib/readiness.ts');

ok('kept copy: left and right are different at a 10 degree gap', () => {
  assert.equal(hip.HIP_FLEX_SIDES_DIFFER_LINE, 'Left and right are different');
  assert.equal(hip.HIP_FLEX_SIDES_DIFFER_MIN_GAP, 10);
  assert.equal(hip.hipSidesDiffer(70, 80), true);
  assert.equal(hip.hipSidesDiffer(70, 79.5), false);
  assert.equal(hip.hipSidesDiffer(70, null), false);
});
ok('the not scored copy and filters are gone from hipFlex.ts', () => {
  assert.equal(hip.HIP_FLEX_NOT_SCORED_LINE, undefined);
  assert.equal(hip.HIP_FLEX_NOT_SCORED_CHIP, undefined);
  assert.equal(hip.withoutHipFlex, undefined);
  assert.equal(mb.HIP_FLEX_UNSCORED_FALLBACK, false);
  assert.equal(mb.JOINT_SCORE_TARGETS.hip_flex, 120);
});
ok('Base band labels are used verbatim', () => {
  assert.deepEqual({ ...mb.BAND_FULL }, { 1: 'Needs focus', 2: 'Building', 3: 'Steady' });
});
const full = { assessed_at: '2026-11-05T12:00:00Z', hip_er_l: 30, hip_er_r: 30, hip_ir_l: 30, hip_ir_r: 30, hip_abd_l: 45, hip_abd_r: 45, hip_flex_l: 125, hip_flex_r: 125,
  shoulder_er_l: 90, shoulder_er_r: 90, shoulder_flex_l: 150, shoulder_flex_r: 150, ankle_df_l: 7, ankle_df_r: 7,
  cervical_lat_l: 40, cervical_lat_r: 40, cervical_flex: 45, cervical_ext: 50 };
ok('everything at or above target is 100 and Steady', () => {
  assert.equal(rd.computePRS(full), 100);
  assert.equal(rd.readinessBand(full), 3);
  assert.equal(rd.computePRS({}), 100);
});
ok('hip flexion is scored: it moves the /100 and the band', () => {
  const low = { ...full, hip_flex_l: 60, hip_flex_r: 60 };
  assert.ok(rd.computePRS(low) < 100);
  assert.equal(rd.readinessBand(low), 1);
  assert.equal(rd.readinessBand({ ...full, hip_flex_l: 110, hip_flex_r: 125 }), 2);
});
ok('J4: an assessment saved before the cutover keeps hip flexion unscored (not recomputed)', () => {
  const old = { ...full, assessed_at: '2026-10-20T12:00:00Z', hip_flex_l: 40, hip_flex_r: 40 };
  assert.equal(rd.hipFlexScored(old), false);
  assert.equal(rd.computePRS(old), 100);
  assert.equal(rd.readinessBand(old), 3);
  assert.equal(rd.hipFlexScored(full), true);
});
ok('cutover unknown (row missing, table missing or signed out): everything is pre-cutover, even a brand new row', () => {
  st.setHipFlexScoredAtMs(null);
  try {
    assert.equal(rd.hipFlexScored(full), false);
    assert.equal(rd.computePRS({ ...full, hip_flex_l: 40, hip_flex_r: 40 }), 100);
  } finally { st.setHipFlexScoredAtMs(CUT); }
});
ok('boundary: exactly at the cutover is scored, a second before is not', () => {
  assert.equal(rd.hipFlexScored({ assessed_at: '2026-11-03T00:00:00Z' }), true);
  assert.equal(rd.hipFlexScored({ assessed_at: '2026-11-02T23:59:59Z' }), false);
});
ok('pack score equals the Base function (mobilityScoreForAssessment) on the same row', () => {
  const row = { ...full, hip_er_l: 20, shoulder_flex_l: 120, ankle_df_r: 4 };
  assert.equal(rd.computePRS(row), mb.mobilityScoreForAssessment(row));
  assert.equal(rd.readinessBand(row), mb.overallBandForAssessment(row));
});
ok('lumbar is out of the overall (Base rule)', () => {
  assert.equal(rd.computePRS({ ...full, lumbar_flex: 1, lumbar_ext: 1 }), 100);
});

// Source checks (pages)
const B = src('src/pages/MyBody.tsx'), R = src('src/pages/ResultsPreview.tsx'), S = src('src/pages/Settings.tsx'), A = src('src/pages/Assessment.tsx');
ok('my body: rows come from Base joint rows and Base targets, measured joints only, no lumbar, hip flexion hidden before the cutover', () => {
  assert.match(B, /jointDisplayRowsForAssessment\(hipView\(assessment\)\)\s*\.filter\(r => !isLumbarKey\(r\.key\)\)/);
  assert.match(B, /if \(pct == null\) return null/);
  assert.doesNotMatch(B, /NotScoredRow|HIP_FLEX_NOT_SCORED|withoutHipFlex/);
  const hv = readFileSync(join(ROOT, 'src/lib/readiness.ts'), 'utf8');
  assert.match(hv, /hipFlexScoredFor\(a\)/);
  assert.doesNotMatch(hv, /HIP_FLEX_SCORED_AT\b/);
});
ok('the cutover is read from scoring_cutovers at runtime', () => {
  assert.match(src('src/lib/hipFlexCutover.ts'), /from\('scoring_cutovers'\)\.select\('effective_at'\)\.eq\('key', 'hip_flex_scored'\)/);
});
ok('one shared score and band: pages import from readiness, bands come from Base labels, no old tier names', () => {
  for (const [name, s] of [['MyBody', B], ['ResultsPreview', R], ['Settings', S]]) {
    assert.match(s, /import \{[^}]*computePRS[^}]*readinessBand[^}]*\} from '\.\.\/lib\/readiness'/, name);
    assert.match(s, /BAND_FULL\[3\]/, name);
    assert.doesNotMatch(s, /label: '(ELITE|STRONG|DEVELOPING|RESTRICTED|AT RISK|NEAR TARGET|BELOW TARGET|WELL BELOW TARGET)'/, name);
  }
  assert.doesNotMatch(R, /AT RISK means/);
});
ok('assessment page no longer prints the not scored line', () => {
  assert.doesNotMatch(A, /HIP_FLEX_NOT_SCORED_LINE/);
});
console.log(`\nhip-scored: ${n} checks passed`);
