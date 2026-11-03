// FG-09/10/11 + FG-21 Settings wiring. Transpiles the real libs with the repo's TypeScript and checks behavior, then static-checks Settings.tsx.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import ts from 'typescript'
const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'optin-'))
const load = async (name) => {
  writeFileSync(join(dir, name + '.mjs'), ts.transpileModule(src(`lib/${name}.ts`), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText)
  return import(pathToFileURL(join(dir, name + '.mjs')).href)
}
const R = await load('reminderOptIn'), D = await load('deletionStatus')

// shown ON only with toggle AND marker
const T = '2026-11-02T12:00:00Z'
assert.deepEqual(R.reminderStateFromRow({ retest_reminders: true, retest_opt_in_at: null, email_reminders: true, protocol_opt_in_at: null, weekly_digest: true, digest_opt_in_at: null }), { retest: false, protocol: false, digest: false }, 'default-on rows without markers show OFF')
assert.deepEqual(R.reminderStateFromRow({ retest_reminders: false, retest_opt_in_at: T, email_reminders: false, protocol_opt_in_at: T, weekly_digest: false, digest_opt_in_at: T }), { retest: false, protocol: false, digest: false }, 'marker without toggle shows OFF')
assert.deepEqual(R.reminderStateFromRow({ retest_reminders: true, retest_opt_in_at: T, email_reminders: true, protocol_opt_in_at: T, weekly_digest: true, digest_opt_in_at: T }), { retest: true, protocol: true, digest: true })
assert.deepEqual(R.reminderStateFromRow(null), { retest: false, protocol: false, digest: false })
assert.deepEqual(R.reminderStateFromRow({ retest_reminders: 'true', retest_opt_in_at: T }), { retest: false, protocol: false, digest: false }, 'only a real true counts')

// save calls the RPC only for switches that changed
const calls = []
const rpcOk = async (fn, args) => { calls.push([fn, args]); return { error: null } }
let r = await R.saveReminderChanges(rpcOk, { retest: false, protocol: false, digest: false }, { retest: true, protocol: false, digest: true })
assert.equal(r.ok, true); assert.deepEqual(calls, [['set_reminder_opt_in', { p_kind: 'retest', p_on: true }], ['set_reminder_opt_in', { p_kind: 'digest', p_on: true }]]); assert.deepEqual(r.applied, { retest: true, protocol: false, digest: true })
calls.length = 0
r = await R.saveReminderChanges(rpcOk, { retest: true, protocol: true, digest: true }, { retest: true, protocol: true, digest: true })
assert.equal(calls.length, 0); assert.equal(r.ok, true); // nothing touched, nothing sent
r = await R.saveReminderChanges(rpcOk, { retest: true, protocol: false, digest: false }, { retest: false, protocol: false, digest: false })
assert.deepEqual(calls.at(-1), ['set_reminder_opt_in', { p_kind: 'retest', p_on: false }]); assert.deepEqual(r.applied, { retest: false, protocol: false, digest: false }) // turning off goes through the RPC too
// error stops the loop and reports what was applied
calls.length = 0
const rpcFailSecond = async (fn, args) => { calls.push(args.p_kind); return args.p_kind === 'protocol' ? { error: { message: 'nope' } } : { error: null } }
r = await R.saveReminderChanges(rpcFailSecond, { retest: false, protocol: false, digest: false }, { retest: true, protocol: true, digest: true })
assert.equal(r.ok, false); assert.equal(r.message, 'nope'); assert.deepEqual(calls, ['retest', 'protocol']); assert.deepEqual(r.applied, { retest: true, protocol: false, digest: false })
r = await R.saveReminderChanges(async () => { throw new Error('net') }, { retest: false, protocol: false, digest: false }, { retest: true, protocol: false, digest: false })
assert.equal(r.ok, false)

// deletion status: newest row only, unknown or error = nothing shown
const from = (res) => () => ({ select: () => ({ order: () => ({ limit: async () => res }) }) })
assert.equal(await D.loadDeletionStatus(from({ data: [{ status: 'in_progress' }], error: null })), 'in_progress')
assert.equal(await D.loadDeletionStatus(from({ data: [], error: null })), null)
assert.equal(await D.loadDeletionStatus(from({ data: null, error: { code: '42P01' } })), null)
assert.equal(await D.loadDeletionStatus(from({ data: [{ status: 'weird' }], error: null })), null)
assert.equal(await D.loadDeletionStatus(() => { throw new Error('x') }), null)
for (const k of ['requested', 'in_progress', 'completed', 'failed']) assert.ok(D.DELETION_STATUS_COPY[k].length > 0)

// Settings.tsx wiring
const page = src('pages/Settings.tsx')
assert.ok(/REMINDER_MARKER_COLUMNS/.test(page) && /reminderStateFromRow\(data\)/.test(page), 'load reads the markers')
const upsertBlocks = [...page.matchAll(/\.upsert\(\s*\{[\s\S]*?\}\s*,/g)].map((m) => m[0]).filter((b) => b.includes('push_reminders') && b.includes('reminder_time') && !b.includes("'08:00'"))
assert.ok(upsertBlocks.length >= 1)
for (const b of upsertBlocks) assert.ok(!/email_reminders|retest_reminders|weekly_digest/.test(b), 'the save upsert does not write the three reminder toggles')
assert.ok(/saveReminderChanges\(/.test(page) && /supabase\.rpc\(fn, args\)/.test(page), 'save goes through set_reminder_opt_in')
assert.ok(/if \(error\) \{[\s\S]{0,260}Could not load/.test(page), 'a load error does not write default settings')
assert.ok(/const SHOW_DELETION_STATUS = false/.test(page) && /if \(!SHOW_DELETION_STATUS \|\| !user\)/.test(page), 'deletion status is off and reads nothing while off')
assert.ok(/DELETION_STATUS_COPY\[deletionStatus\]/.test(page))
rmSync(dir, { recursive: true })
console.log('reminder opt-in + deletion status tests: ALL PASS')
