// FG-13 client helper: a partial export is never saved; reauth is told apart; version 2 + complete:true required.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import ts from 'typescript'
const code = readFileSync(new URL('../src/lib/exportMyData.ts', import.meta.url), 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'exp-'))
writeFileSync(join(dir, 'e.mjs'), ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
const m = await import(pathToFileURL(join(dir, 'e.mjs')).href)
const good = { export_version: 2, complete: true, data: { profile: [] }, tables: { profile: { rows: 1, truncated: false }, workouts: { rows: 0, truncated: false } } }
const call = (res) => m.requestMyDataExport(async () => res, () => new Date('2026-11-02T12:00:00Z'))
const r = await call({ data: good, error: null })
assert.equal(r.ok, true); assert.equal(r.filename, 'romrx-my-data-2026-11-02.json')
for (const [name, d] of [
  ['truncated at the cap', { ...good, complete: false, tables: { ...good.tables, workout_sets: { rows: 5000, truncated: true } } }],
  ['complete says true but a table is truncated', { ...good, tables: { ...good.tables, workout_sets: { rows: 5000, truncated: true } } }],
  ['a table errored', { ...good, complete: false, tables: { ...good.tables, workouts: { error: true } } }],
  ['complete missing', { ...good, complete: undefined }],
  ['old version 1', { ...good, export_version: 1 }],
  ['no tables object', { ...good, tables: undefined }],
]) { const x = await call({ data: d, error: null }); assert.deepEqual(x, { ok: false, reason: name === 'old version 1' ? 'failed' : 'incomplete' }, name) }
assert.deepEqual(await call({ data: null, error: null }), { ok: false, reason: 'failed' })
assert.deepEqual(await call({ data: good, error: { message: 'x' } }), { ok: false, reason: 'failed' })
assert.deepEqual(await call({ data: null, error: { context: { json: async () => ({ error: 'reauth_required' }) } } }), { ok: false, reason: 'reauth' })
assert.deepEqual(await call({ data: null, error: { context: { json: async () => ({ error: 'rate_limited' }) } } }), { ok: false, reason: 'failed' })
assert.deepEqual(await call({ data: null, error: { context: { json: async () => { throw new Error('x') } } } }), { ok: false, reason: 'failed' })
assert.deepEqual(await m.requestMyDataExport(async () => { throw new Error('net') }), { ok: false, reason: 'failed' })
assert.equal(m.exportErrorCopy('incomplete'), m.EXPORT_ERROR_COPY); assert.equal(m.exportErrorCopy('failed'), m.EXPORT_ERROR_COPY); assert.equal(m.exportErrorCopy('reauth'), m.EXPORT_REAUTH_COPY)
// the page shows the error for every failed reason, never saves
const page = readFileSync(new URL('../src/pages/Settings.tsx', import.meta.url), 'utf8')
assert.ok(/if \(r\.ok\) saveJsonDownload\(r\.filename, r\.json\)\s*\n\s*else setExportErr\(exportErrorCopy\(r\.reason\)\)/.test(page), 'Settings shows the error instead of saving')
assert.ok(/const SHOW_EXPORT_MY_DATA = false/.test(page), 'button stays hidden')
rmSync(dir, { recursive: true })
console.log('export helper tests: ALL PASS')
