// node scripts/color-movement-derive.test.mjs : FG-19 fallback. The sport tab color counts are derived from the user's two most recent
// assessments (Base plus sport share one table) when the rpc has no second stored set. Rules mirror recompute_user_eligibility.
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = (p) => readFileSync(join(ROOT, p), 'utf8');
const tmp = mkdtempSync(join(tmpdir(), 'cmderive-'));
const out = ts.transpileModule(src('src/lib/colorMovementDerive.ts'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const f = join(tmp, 'derive.mjs'); writeFileSync(f, out);
const d = await import(pathToFileURL(f).href);
let n = 0; const ok = (name, fn) => { fn(); n++; console.log('ok', n, name); };

const full = (v) => ({ hip_er_l: v, hip_er_r: v, hip_ir_l: v, hip_ir_r: v, hip_abd_l: v, hip_abd_r: v, hip_flex_l: v, hip_flex_r: v,
  shoulder_er_l: v, shoulder_er_r: v, shoulder_flex_l: v, shoulder_flex_r: v, ankle_df_l: v, ankle_df_r: v,
  cervical_rot_l: v, cervical_rot_r: v, cervical_lat_l: v, cervical_lat_r: v, lumbar_flex: v, lumbar_ext: v, cervical_flex: v, cervical_ext: v });

ok('a technique with no minimums is GREEN', () => assert.equal(d.tierFor(full(null), { id: 't0' }), 'GREEN'));
ok('ratio under 0.90 is RED, 0.90 to under 1.0 is YELLOW, 1.0 and up is GREEN (boundaries)', () => {
  const t = { id: 't', hip_er_min: 100 };
  assert.equal(d.tierFor({ hip_er_l: 89.99, hip_er_r: 120 }, t), 'RED');
  assert.equal(d.tierFor({ hip_er_l: 90, hip_er_r: 120 }, t), 'YELLOW');
  assert.equal(d.tierFor({ hip_er_l: 99.9, hip_er_r: 120 }, t), 'YELLOW');
  assert.equal(d.tierFor({ hip_er_l: 100, hip_er_r: 100 }, t), 'GREEN');
});
ok('the weaker side decides (Postgres LEAST); a missing side is ignored', () => {
  const t = { id: 't', hip_er_min: 100 };
  assert.equal(d.tierFor({ hip_er_l: 120, hip_er_r: 50 }, t), 'RED');
  assert.equal(d.tierFor({ hip_er_l: null, hip_er_r: 110 }, t), 'GREEN');
});
ok('a required joint not measured is YELLOW, unless another joint is already RED', () => {
  const t = { id: 't', hip_er_min: 100, hip_ir_min: 40 };
  assert.equal(d.tierFor({ hip_er_l: 120, hip_er_r: 120 }, t), 'YELLOW');
  assert.equal(d.tierFor({ hip_er_l: 50, hip_er_r: 50 }, t), 'RED');
});
ok('zero or null minimums are not requirements; single-value joints (lumbar) work', () => {
  assert.equal(d.tierFor(full(null), { id: 't', hip_er_min: 0, hip_ir_min: null }), 'GREEN');
  assert.equal(d.tierFor({ lumbar_flex: 40 }, { id: 't', lumbar_flex_min: 60 }), 'RED');
  assert.equal(d.tierFor({ lumbar_flex: 60 }, { id: 't', lumbar_flex_min: 60 }), 'GREEN');
});
ok('strings from the database are read as numbers', () => assert.equal(d.tierFor({ hip_er_l: '95', hip_er_r: '95' }, { id: 't', hip_er_min: '100' }), 'YELLOW'));

const techs = [
  { id: 'a', hip_er_min: 100 },                 // 60 -> 110 : RED -> GREEN
  { id: 'b', hip_er_min: 100 },                 // same as a
  { id: 'c', hip_ir_min: 100 },                 // 95 -> 100 : YELLOW -> GREEN
  { id: 'd', shoulder_er_min: 100 },            // 100 -> 95 : GREEN -> YELLOW
  { id: 'e', ankle_df_min: 100 },               // 95 -> 50 : YELLOW -> RED
  { id: 'f', lumbar_ext_min: 100 },             // 100 -> 50 : GREEN -> RED
  { id: 'g', cervical_lat_min: 100 },           // 50 -> 95 : RED -> YELLOW
  { id: 'h', lumbar_flex_min: 100 },            // no change
];
const A = { hip_er_l: 60, hip_er_r: 60, hip_ir_l: 95, hip_ir_r: 95, shoulder_er_l: 100, shoulder_er_r: 100, ankle_df_l: 95, ankle_df_r: 95, lumbar_ext: 100, cervical_lat_l: 50, cervical_lat_r: 50, lumbar_flex: 100 };
const B = { hip_er_l: 110, hip_er_r: 110, hip_ir_l: 100, hip_ir_r: 100, shoulder_er_l: 95, shoulder_er_r: 95, ankle_df_l: 50, ankle_df_r: 50, lumbar_ext: 50, cervical_lat_l: 95, cervical_lat_r: 95, lumbar_flex: 100 };
ok('movementBetween counts every kind of change and ignores unchanged', () => {
  const m = d.movementBetween(A, B, techs, '2026-10-01T00:00:00Z', '2026-11-01T00:00:00Z');
  assert.deepEqual({ ...m }, { status: 'ok', earlier_at: '2026-10-01T00:00:00Z', later_at: '2026-11-01T00:00:00Z',
    red_to_yellow: 1, red_to_green: 2, yellow_to_green: 1, green_to_yellow: 1, yellow_to_red: 1, green_to_red: 1 });
});
ok('same assessment against itself changes nothing', () => {
  const m = d.movementBetween(A, A, techs, null, null);
  assert.equal(m.red_to_yellow + m.red_to_green + m.yellow_to_green + m.green_to_yellow + m.yellow_to_red + m.green_to_red, 0);
});
ok('latestTwo takes the two newest by assessed_at, else created_at, as [earlier, later]; fewer than two is null', () => {
  const r1 = { id: 1, assessed_at: '2026-09-01T00:00:00Z' }, r2 = { id: 2, assessed_at: null, created_at: '2026-10-01T00:00:00Z' }, r3 = { id: 3, assessed_at: '2026-11-01T00:00:00Z' };
  const p = d.latestTwo([r1, r3, r2]);
  assert.deepEqual([p[0].id, p[1].id], [2, 3]);
  assert.equal(d.latestTwo([r1]), null);
  assert.equal(d.latestTwo([]), null);
  assert.equal(d.assessmentAt(r2), '2026-10-01T00:00:00Z');
});
ok('select list covers the 13 joint minimums plus id and sport', () => {
  const cols = d.TECHNIQUE_COLUMNS.split(',');
  assert.equal(cols.length, 15); assert.ok(cols.includes('id') && cols.includes('sport') && cols.includes('cervical_ext_min'));
});
ok('component: the rpc answer is used first; the derive is the fallback; own rows only; read-only; renders nothing when empty', () => {
  const c = src('src/components/ColorMovement.tsx');
  assert.match(c, /status === 'ok'\) \{ if \(live\) setM\(row as Movement\); return \}/);
  assert.match(c, /const derived = await deriveFromAssessments\(SPORT\)/);
  assert.match(c, /\.from\('assessments'\)\.select\('\*'\)\.eq\('user_id', uid\)/);
  assert.match(c, /\.from\('techniques'\)\.select\(TECHNIQUE_COLUMNS\)\.eq\('sport', sport\)/);
  assert.match(c, /if \(!uid\) return null/);
  assert.match(c, /if \(shown\.length === 0\) return null/);
  assert.doesNotMatch(c, /\.(insert|update|upsert|delete)\(/);
  assert.doesNotMatch(src('src/lib/colorMovementDerive.ts'), /supabase/);
});
console.log(`color-movement-derive: ${n} checks passed`);
