// node scripts/hip-not-scored.test.mjs : hip flexion is saved for each leg and NOT scored (Stacy-cleared copy, Oct 5 2026).
// Unit checks on src/lib/hipFlex.ts + src/lib/readiness.ts (transpiled with the repo's TypeScript), plus source checks on the pages.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'hipflex-'));
async function load(rel) {
  const out = ts.transpileModule(src(rel), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
  const f = join(tmp, rel.replace(/[\/]/g, '_').replace(/\.ts$/, '.mjs'));
  writeFileSync(f, out);
  return import(pathToFileURL(f).href);
}
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', n, name); };
const hip = await load('src/lib/hipFlex.ts');
const rd = await load('src/lib/readiness.ts');

ok('cleared copy, word for word', () => {
  assert.equal(hip.HIP_FLEX_NOT_SCORED_LINE, 'Saved for each leg, not scored.');
  assert.equal(hip.HIP_FLEX_NOT_SCORED_CHIP, 'Not scored');
  assert.equal(hip.HIP_FLEX_SIDES_DIFFER_LINE, 'Left and right are different');
  assert.equal(hip.HIP_FLEX_SIDES_DIFFER_MIN_GAP, 10);
});
ok('"Left and right are different" at a gap of 10 degrees or more only', () => {
  assert.equal(hip.hipSidesDiffer(70, 80), true);
  assert.equal(hip.hipSidesDiffer('80', '70'), true);
  assert.equal(hip.hipSidesDiffer(70, 79.5), false);
  assert.equal(hip.hipSidesDiffer(70, null), false);
  assert.equal(hip.hipSidesDiffer('', '90'), false);
});
ok('hip flexion is never a priority joint or a red flag', () => {
  assert.deepEqual(hip.withoutHipFlex(['hip_flex', 'ankle_df', 'hip_flex_l', 'hip_ir']), ['ankle_df', 'hip_ir']);
  assert.deepEqual(hip.withoutHipFlex(null), []);
  assert.deepEqual(hip.withoutHipFlexReasons(['Hip flexion below 100°', 'hip_flex_r asymmetry', 'Ankle DF below 10 cm']), ['Ankle DF below 10 cm']);
});
ok('PRS tables have no hip flexion', () => {
  assert.ok(!rd.PRS_BILATERAL.some((j) => /hip_flex/.test(j.l + j.r)));
  assert.ok(!rd.PRS_UNILATERAL.some((j) => /hip_flex/.test(j.key)));
  assert.equal(rd.PRS_BILATERAL.length, 7);
  assert.equal(rd.PRS_UNILATERAL.length, 4);
});
const base = { hip_er_l: 45, hip_er_r: 44, hip_ir_l: 28, hip_ir_r: 35, hip_abd_l: 41, hip_abd_r: 39, shoulder_er_l: 70, shoulder_er_r: 62,
  shoulder_flex_l: 150, shoulder_flex_r: 135, ankle_df_l: 9, ankle_df_r: 12, cervical_lat_l: 41, cervical_lat_r: 42,
  lumbar_flex: 45, lumbar_ext: 18, cervical_flex: 50, cervical_ext: 50 };
ok('hip flexion values never change the Position Readiness Score', () => {
  const s0 = rd.computePRS(base);
  for (const [l, r] of [[40, 95], [60, 60], [120, 120], [150, 90], [null, 70]]) assert.equal(rd.computePRS({ ...base, hip_flex_l: l, hip_flex_r: r }), s0);
});
ok('other joints score exactly as before (old formula minus the hip flexion row)', () => {
  // hip_ir 28 < 30: -8, gap 7 none; hip_abd 39 >= 35 (bodybuilding threshold): 0; shoulder_er gap 8: -3; shoulder_flex 135 < 140: -4, gap 15: -6;
  // ankle 9 < 10: -8; lumbar_ext 18 < 20: -3; cervical_ext 50 < 55: -3  => 100 - 35 = 65
  assert.equal(rd.computePRS(base), 65);
  assert.deepEqual(rd.PRS_BILATERAL.find((j) => j.l === 'hip_abd_l'), { l: 'hip_abd_l', r: 'hip_abd_r', riskBelow: 25, normalMin: 35 });
  assert.equal(rd.computePRS({}), 100);
});

// Source checks (pages)
const A = src('src/pages/Assessment.tsx'), B = src('src/pages/MyBody.tsx'), P = src('src/pages/MyProtocol.tsx');
const R = src('src/pages/ResultsPreview.tsx'), S = src('src/pages/Settings.tsx');
ok('assessment: hip flexion fields have no range and no badge, cleared lines shown', () => {
  assert.match(A, /\{ key: 'hip_flex_l', label: 'Left', unit: '°', notScored: true \}/);
  assert.match(A, /\{ key: 'hip_flex_r', label: 'Right', unit: '°', notScored: true \}/);
  assert.doesNotMatch(A, /hip_flex_[lr]'[^\n]*normalLow/);
  assert.match(A, /if \(field\.notScored \|\| field\.riskBelow == null \|\| field\.normalLow == null\) return null/); // no color, no AT RISK / LOW / FUNCTIONAL
  assert.match(A, /\{!field\.notScored && \(\s*<span[^>]*>Normal:/);
  assert.match(A, /\{field\.notScored && \(\s*<p[^>]*>\{HIP_FLEX_NOT_SCORED_LINE\}<\/p>/);
  assert.match(A, /hipSidesDiffer\(values\[step\.fields\[0\]\.key\], values\[step\.fields\[1\]\.key\]\)[\s\S]{0,120}\{HIP_FLEX_SIDES_DIFFER_LINE\}/);
});
ok('my body: no OPTIMAL bar (was 110), no radar axis, Not scored row, filtered flags and priority joints', () => {
  assert.doesNotMatch(B, /'Hip Flex'/);
  assert.match(B, /<NotScoredRow label="Hip Flexion" left=\{assessment\.hip_flex_l\} right=\{assessment\.hip_flex_r\} \/>/);
  assert.doesNotMatch(B, /<JointBar[^>]*hip_flex/);
  assert.match(B, /\{HIP_FLEX_NOT_SCORED_CHIP\}/);
  assert.match(B, /const priorityJoints = withoutHipFlex\(assessment\.worst_joints\)/);
  assert.match(B, /const redFlagReasons = withoutHipFlexReasons\(assessment\.red_flag_reasons\)/);
  assert.doesNotMatch(B, /assessment\.worst_joints\.map|assessment\.red_flag_reasons\?\.join/);
});
ok('my protocol: hip flexion is never ranked', () => {
  const joints = P.slice(P.indexOf('const JOINTS: JointDef[]'), P.indexOf('// ── Scoring'));
  assert.doesNotMatch(joints, /key: 'hip_flex'/);
  assert.doesNotMatch(joints, /normalMax: 120/);
});
ok('one shared score: pages import computePRS, none keeps its own copy or a hip flexion row', () => {
  for (const [name, s] of [['MyBody', B], ['ResultsPreview', R], ['Settings', S]]) {
    assert.match(s, /import \{[^}]*computePRS[^}]*\} from '\.\.\/lib\/readiness'/, name);
    assert.doesNotMatch(s, /function computePRS/, name);
    assert.doesNotMatch(s, /\{ l: 'hip_flex_l'/, name);
  }
});
ok('no "Normal: 100" hip range anywhere in src', () => {
  for (const s of [A, B, P, R, S]) assert.doesNotMatch(s, /normalLow: 100, normalHigh: 120/);
});
console.log(`\nhip-not-scored: ${n} checks passed`);
