// BB tier picker: when does the "Pick your level" card show?
// Transpiles the real src/lib/bbTier.ts + src/lib/access.ts with the repo's TypeScript
// (no new deps) and checks needsBbTierPick, then static-checks the wiring in MyGame.tsx.
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import ts from 'typescript'

const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'bb-tier-'))
const emit = (code, name) => {
  const out = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, verbatimModuleSyntax: true },
  }).outputText.replace(/from '\.\/access'/g, "from './access.mjs'")
  writeFileSync(join(dir, name), out)
}
emit(src('lib/access.ts'), 'access.mjs')
emit(src('lib/bbTier.ts'), 'bbTier.mjs')
const { needsBbTierPick, BB_TIER_VALUES, isBbTier, bbTierPickerBody, BB_TIER_PICKER_HEADING, BB_TIER_PICKER_SETTINGS_NOTE, BB_TIER_EXERCISE_COUNTS } = await import(pathToFileURL(join(dir, 'bbTier.mjs')).href)
rmSync(dir, { recursive: true, force: true })

const NOW = Date.parse('2026-10-05T23:00:00Z')
const pack = [{ sport: 'bodybuilding', status: 'active', expires_at: null }]
const empty = { active_bb_tier: null }

// Tier values match what set_my_bb_tier accepts.
assert.deepEqual([...BB_TIER_VALUES], ['beginner', 'intermediate', 'advanced'])

// 1. Owns the pack + empty tier: card shows.
assert.equal(needsBbTierPick(empty, pack, NOW), true, 'owner, null tier')
assert.equal(needsBbTierPick({ active_bb_tier: '' }, pack, NOW), true, 'owner, empty-string tier')
assert.equal(needsBbTierPick(empty, [{ sport: 'bodybuilding', status: 'trialing', expires_at: '2026-11-01T00:00:00Z' }], NOW), true, 'trialing, not expired')

// 2. Tier set: card hidden.
for (const t of BB_TIER_VALUES) {
  assert.equal(isBbTier(t), true)
  assert.equal(needsBbTierPick({ active_bb_tier: t }, pack, NOW), false, `tier ${t} set`)
}

// 3. Does not own the pack: card hidden.
assert.equal(needsBbTierPick(empty, [], NOW), false, 'no entitlements')
assert.equal(needsBbTierPick(empty, undefined, NOW), false, 'entitlements missing')
assert.equal(needsBbTierPick(empty, [{ sport: 'bjj', status: 'active', expires_at: null }], NOW), false, 'other sport only')
assert.equal(needsBbTierPick(empty, [{ sport: 'bodybuilding', status: 'canceled', expires_at: null }], NOW), false, 'canceled pack')
assert.equal(needsBbTierPick(empty, [{ sport: 'bodybuilding', status: 'active', expires_at: '2026-10-01T00:00:00Z' }], NOW), false, 'expired pack')
assert.equal(needsBbTierPick(null, pack, NOW), false, 'no profile')

// Copy: Stacy-cleared strings, counts from the single constant.
assert.equal(BB_TIER_PICKER_HEADING, 'Pick your level')
assert.equal(bbTierPickerBody(), 'Beginner unlocks 88 exercises, Intermediate 205, Advanced 274.')
assert.equal(BB_TIER_PICKER_SETTINGS_NOTE, 'You can change it later in Settings.')
assert.deepEqual({ ...BB_TIER_EXERCISE_COUNTS }, { beginner: 88, intermediate: 205, advanced: 274 })
// Settings note is only true while Settings keeps an unconditional Training Tier picker that calls set_my_bb_tier.
const settings = src('pages/Settings.tsx')
assert.match(settings, /Training Tier/)
assert.match(settings, /supabase\.rpc\('set_my_bb_tier'/)

// Wiring: the card replaces the dead Generate tab and the Library "go to Settings" state; no auto-default.
const game = src('pages/MyGame.tsx')
assert.match(game, /const needsTier = needsBbTierPick\(profile, entitlements\)/)
assert.match(game, /tab === 'generate' && \(needsTier\s+\? <BbTierPicker onPicked=\{reload\} \/>/)
assert.match(game, /if \(needsTier\) return <BbTierPicker onPicked=\{onTierPicked\} \/>/)
const picker = src('components/BbTierPicker.tsx')
assert.match(picker, /supabase\.rpc\('set_my_bb_tier', \{ p_tier: tier \}\)/)
assert.doesNotMatch(picker + src('lib/bbTier.ts'), /useEffect|set_my_bb_tier', \{ p_tier: '/, 'no automatic tier write')
assert.doesNotMatch(picker + src('lib/bbTier.ts'), /\u2014/, 'copy: no em dash')
assert.doesNotMatch(picker, /Profile/, 'copy: never "Profile"')
assert.doesNotMatch(picker, /\d{2,3} exercises/, 'counts live only in BB_TIER_EXERCISE_COUNTS')

console.log('bb-tier-picker: all checks passed')
