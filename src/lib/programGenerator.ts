// ────────────────────────────────────────────────────────────────────────────
//  Program Generator engine (bodybuilding / hypertrophy)
//
//  Pure, side-effect-free logic. Given the user's ROM assessment, their
//  unlocked exercise library, the per-muscle volume landmarks, and a few
//  preferences (split, days, emphasis, mesocycle week), it builds a complete
//  multi-day training program:
//
//   • Per-muscle WEEKLY set targets are derived from MEV/MAV/MRV landmarks,
//     scaled by the current mesocycle week (accumulation → overreach → deload).
//   • Exercises are selected from the user's unlocked library, FILTERED BY
//     ROM READINESS — green movements first, and when a high-stretch lift is
//     "mobility first" (red) we auto-swap to a same-muscle, lower-stretch
//     movement the user can actually load through full range. This is the
//     ROMRx differentiator wired straight into program design.
//   • Volume is distributed across the week's sessions so each muscle lands
//     inside its productive (MAV) band.
//
//  The engine writes nothing — the caller persists the result to
//  workouts + workout_exercises.
// ────────────────────────────────────────────────────────────────────────────

import type { Assessment } from '../hooks/useProfile'

// ── Shared types (kept structurally compatible with MyGame.UnlockedTechnique) ─

export interface GenExercise {
  id: string
  code: string
  name: string
  category: string | null
  subcategory: string | null
  tier: string | null
  hip_er_min: number | null
  hip_ir_min: number | null
  hip_abd_min: number | null
  hip_flex_min: number | null
  shoulder_er_min: number | null
  shoulder_flex_min: number | null
  ankle_df_min: number | null
  lumbar_flex_min: number | null
  lumbar_ext_min: number | null
  cervical_lat_min: number | null
  cervical_flex_min: number | null
  cervical_ext_min: number | null
  primary_muscle: string | null
  secondary_muscles: string[] | null
  stretch_emphasis: string | null
  limiting_joint: string | null
  rom_note: string | null
}

export interface VolumeLandmark {
  muscle: string
  mv: number
  mev: number
  mav_low: number
  mav_high: number
  mrv: number
}

export type SplitType = 'full_body' | 'upper_lower' | 'ppl'

export interface GeneratorPrefs {
  split: SplitType
  days: number               // sessions per week
  emphasis: string[]         // muscles to bias toward MAV-high (optional)
  mesoWeek: number           // current mesocycle week (1-based); 1 if none
  mesoWeeks: number          // total weeks in the block; 0 if none
  experience: 'beginner' | 'intermediate' | 'advanced'
}

// One planned exercise inside a session.
export interface PlannedExercise {
  technique_id: string
  exercise_name: string
  primary_muscle: string | null
  sets: number
  reps_min: number
  reps_max: number
  rest_min: number
  rest_max: number
  stretch_emphasis: string | null
  readiness: number | null      // computed ROM readiness pct (null = no ROM req)
  swapped_from: string | null   // original exercise name if ROM-swapped
  rom_note: string | null
  note: string | null           // human-readable selection note
}

export interface PlannedSession {
  day_index: number
  day_label: string             // e.g. "Push A", "Upper A", "Full Body 1"
  split_type: SplitType
  focus_muscles: string[]
  exercises: PlannedExercise[]
}

export interface GeneratedProgram {
  program_key: string           // 'generated:<uuid>'
  name: string
  split: SplitType
  days: number
  tier: string
  meso_week: number
  meso_weeks: number
  sessions: PlannedSession[]
  // Per-muscle weekly planned sets vs landmark band (for the editor tally).
  weekly_volume: Array<{ muscle: string; planned: number; lm: VolumeLandmark }>
  notes: string[]               // generation log / coaching notes
}

// ── Muscle → category routing (matches techniques.category) ──────────────────

const MUSCLE_CATEGORY: Record<string, 'Push' | 'Pull' | 'Lower' | 'Core'> = {
  Chest: 'Push', Triceps: 'Push', 'Front Delts': 'Push', 'Side Delts': 'Push', 'Rear Delts': 'Push',
  Back: 'Pull', Biceps: 'Pull', Forearms: 'Pull', Traps: 'Pull',
  Quads: 'Lower', Hamstrings: 'Lower', Glutes: 'Lower', Calves: 'Lower',
  Abs: 'Core',
}

// Default per-session muscle priority within each push/pull/lower bucket — the
// "anchor" muscles that should always get coverage, in order.
const PUSH_MUSCLES = ['Chest', 'Side Delts', 'Triceps', 'Front Delts', 'Rear Delts']
const PULL_MUSCLES = ['Back', 'Biceps', 'Rear Delts', 'Traps']
const LOWER_MUSCLES = ['Quads', 'Hamstrings', 'Glutes', 'Calves']
const CORE_MUSCLES = ['Abs']

// ── ROM readiness (mirrors MyGame.computeReadiness) ──────────────────────────

function bestBilateral(l: number | null, r: number | null): number | null {
  if (l == null && r == null) return null
  return Math.max(l ?? 0, r ?? 0)
}

const JOINT_MAP: ReadonlyArray<{
  pick: (a: Assessment) => number | null
  minKey: keyof GenExercise
}> = [
  { pick: a => bestBilateral(a.hip_er_l, a.hip_er_r), minKey: 'hip_er_min' },
  { pick: a => bestBilateral(a.hip_ir_l, a.hip_ir_r), minKey: 'hip_ir_min' },
  { pick: a => bestBilateral(a.hip_abd_l, a.hip_abd_r), minKey: 'hip_abd_min' },
  { pick: a => bestBilateral(a.hip_flex_l, a.hip_flex_r), minKey: 'hip_flex_min' },
  { pick: a => bestBilateral(a.shoulder_er_l, a.shoulder_er_r), minKey: 'shoulder_er_min' },
  { pick: a => bestBilateral(a.shoulder_flex_l, a.shoulder_flex_r), minKey: 'shoulder_flex_min' },
  { pick: a => bestBilateral(a.ankle_df_l, a.ankle_df_r), minKey: 'ankle_df_min' },
  { pick: a => a.lumbar_flex, minKey: 'lumbar_flex_min' },
  { pick: a => a.lumbar_ext, minKey: 'lumbar_ext_min' },
  { pick: a => bestBilateral(a.cervical_lat_l, a.cervical_lat_r), minKey: 'cervical_lat_min' },
  { pick: a => a.cervical_flex, minKey: 'cervical_flex_min' },
  { pick: a => a.cervical_ext, minKey: 'cervical_ext_min' },
]

export function computeReadiness(tech: GenExercise, a: Assessment | null): number | null {
  if (!a) return null
  let worst = 100
  let hadAny = false
  for (const { pick, minKey } of JOINT_MAP) {
    const required = tech[minKey] as number | null
    if (required == null || required <= 0) continue
    hadAny = true
    const userValue = pick(a)
    if (userValue == null || userValue <= 0) return 0
    const pct = Math.min(100, Math.round((userValue / required) * 100))
    if (pct < worst) worst = pct
  }
  return hadAny ? worst : null
}

const STRETCH_RANK: Record<string, number> = { high: 3, medium: 2, low: 1 }

// ── Volume targeting by mesocycle week ───────────────────────────────────────
//
// Returns the weekly set target for a muscle given its landmark + where we are
// in the block. Accumulation starts near MEV/low-MAV, build climbs through MAV,
// overreach pushes toward MRV, deload drops to ~MV/half.

export function weeklyTargetSets(
  lm: VolumeLandmark, prefs: GeneratorPrefs, emphasized: boolean,
): number {
  const { mesoWeek, mesoWeeks } = prefs
  let target: number

  if (mesoWeeks >= 2 && mesoWeek === mesoWeeks) {
    // Deload week — pull back to maintenance.
    target = Math.max(lm.mv || Math.round(lm.mev * 0.6), Math.round(lm.mev * 0.6))
  } else if (mesoWeeks >= 2) {
    const progress = (mesoWeek - 1) / Math.max(1, mesoWeeks - 1) // 0..1
    if (progress < 0.34) target = Math.round((lm.mev + lm.mav_low) / 2)        // accumulation
    else if (progress < 0.67) target = Math.round((lm.mav_low + lm.mav_high) / 2) // build (mid MAV)
    else target = lm.mav_high                                                  // overreach (high MAV)
  } else {
    // No active block — sit in the productive middle of MAV.
    target = Math.round((lm.mav_low + lm.mav_high) / 2)
  }

  if (emphasized) target = Math.min(lm.mrv, target + 3)

  // Beginners cap at low MAV to keep recovery in check; advanced may ride high.
  if (prefs.experience === 'beginner') target = Math.min(target, lm.mav_low + 1)

  return Math.max(0, target)
}

// ── How many sessions per week hit each category, by split ───────────────────

interface SessionSlot {
  label: string
  split_type: SplitType
  categories: Array<'Push' | 'Pull' | 'Lower' | 'Core'>
}

function buildSchedule(split: SplitType, days: number): SessionSlot[] {
  const slots: SessionSlot[] = []
  const tag = (i: number) => String.fromCharCode(65 + i) // A, B, C…

  if (split === 'full_body') {
    for (let i = 0; i < days; i++) {
      slots.push({ label: `Full Body ${i + 1}`, split_type: 'full_body', categories: ['Push', 'Pull', 'Lower', ...(i % 2 === 0 ? ['Core' as const] : [])] })
    }
  } else if (split === 'upper_lower') {
    let u = 0, l = 0
    for (let i = 0; i < days; i++) {
      if (i % 2 === 0) slots.push({ label: `Upper ${tag(u++)}`, split_type: 'upper_lower', categories: ['Push', 'Pull', ...(i % 4 === 0 ? ['Core' as const] : [])] })
      else slots.push({ label: `Lower ${tag(l++)}`, split_type: 'upper_lower', categories: ['Lower', 'Core'] })
    }
  } else {
    // PPL — cycle Push, Pull, Legs
    const cyc: Array<{ name: string; cats: Array<'Push' | 'Pull' | 'Lower' | 'Core'> }> = [
      { name: 'Push', cats: ['Push'] },
      { name: 'Pull', cats: ['Pull'] },
      { name: 'Legs', cats: ['Lower', 'Core'] },
    ]
    const counts: Record<string, number> = {}
    for (let i = 0; i < days; i++) {
      const c = cyc[i % 3]
      counts[c.name] = (counts[c.name] ?? 0) + 1
      slots.push({ label: `${c.name} ${tag(counts[c.name] - 1)}`, split_type: 'ppl', categories: c.cats })
    }
  }
  return slots
}

// Count how many sessions in the week train a given muscle's category.
function frequencyForMuscle(muscle: string, schedule: SessionSlot[]): number {
  const cat = MUSCLE_CATEGORY[muscle]
  if (!cat) return 0
  return schedule.filter(s => s.categories.includes(cat)).length
}

// ── Exercise selection with ROM filtering + auto-swap ────────────────────────

function repRange(category: string | null): { min: number; max: number; restMin: number; restMax: number } {
  // Compounds (Push/Pull/Lower mains) get lower reps + longer rest; isolation higher.
  if (category === 'Lower' || category === 'Push' || category === 'Pull') return { min: 6, max: 12, restMin: 120, restMax: 180 }
  return { min: 10, max: 20, restMin: 60, restMax: 90 }
}

// Pick the best exercises for a muscle, honoring ROM readiness and preferring
// the stretch-biased movements that drive growth. Returns picks + swap notes.
function pickExercisesForMuscle(
  muscle: string,
  library: GenExercise[],
  assessment: Assessment | null,
  count: number,
  usedIds: Set<string>,
): PlannedExercise[] {
  const candidates = library
    .filter(e => e.primary_muscle === muscle)
    .map(e => ({ e, readiness: computeReadiness(e, assessment) }))

  // Rank: prefer GREEN (>=90 or null), then higher stretch emphasis (growth),
  // then unused. Reds are deprioritized but kept as last resort if needed.
  const ranked = candidates.sort((a, b) => {
    const aGreen = (a.readiness ?? 100) >= 90 ? 1 : 0
    const bGreen = (b.readiness ?? 100) >= 90 ? 1 : 0
    if (aGreen !== bGreen) return bGreen - aGreen
    const aStretch = STRETCH_RANK[a.e.stretch_emphasis ?? 'medium'] ?? 2
    const bStretch = STRETCH_RANK[b.e.stretch_emphasis ?? 'medium'] ?? 2
    if (aStretch !== bStretch) return bStretch - aStretch
    return (a.e.name ?? '').localeCompare(b.e.name ?? '')
  })

  const findSwap = (target: GenExercise): GenExercise | null => {
    const targetStretch = STRETCH_RANK[target.stretch_emphasis ?? 'medium'] ?? 2
    return library
      .filter(c =>
        c.id !== target.id &&
        c.primary_muscle === target.primary_muscle &&
        (STRETCH_RANK[c.stretch_emphasis ?? 'medium'] ?? 2) < targetStretch &&
        (computeReadiness(c, assessment) ?? 100) >= 90 &&
        !usedIds.has(c.id),
      )
      .sort((a, b) => (STRETCH_RANK[b.stretch_emphasis ?? 'low'] ?? 1) - (STRETCH_RANK[a.stretch_emphasis ?? 'low'] ?? 1))[0] ?? null
  }

  const picks: PlannedExercise[] = []
  for (const { e, readiness } of ranked) {
    if (picks.length >= count) break
    if (usedIds.has(e.id)) continue

    let chosen = e
    let swappedFrom: string | null = null
    let note: string | null = null
    const isRed = readiness != null && readiness < 75

    if (isRed) {
      const swap = findSwap(e)
      if (swap) {
        chosen = swap
        swappedFrom = e.name
        note = `ROM swap — ${e.name} needs more range than you have right now; this hits the same ${muscle} without the mobility tax.`
      } else {
        note = `Mobility-limited — reduce range to a pain-free depth and load the partial. ${e.rom_note ?? ''}`.trim()
      }
    } else if (e.stretch_emphasis === 'high') {
      note = 'High-stretch pick — drives growth through the lengthened position.'
    }

    if (usedIds.has(chosen.id)) continue
    usedIds.add(chosen.id)

    const rr = repRange(chosen.category)
    picks.push({
      technique_id: chosen.id,
      exercise_name: chosen.name,
      primary_muscle: chosen.primary_muscle,
      sets: 0, // filled by volume allocation
      reps_min: rr.min,
      reps_max: rr.max,
      rest_min: rr.restMin,
      rest_max: rr.restMax,
      stretch_emphasis: chosen.stretch_emphasis,
      readiness: computeReadiness(chosen, assessment),
      swapped_from: swappedFrom,
      rom_note: chosen.rom_note,
      note,
    })
  }
  return picks
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function generateProgram(
  prefs: GeneratorPrefs,
  library: GenExercise[],
  landmarks: VolumeLandmark[],
  assessment: Assessment | null,
): GeneratedProgram {
  const notes: string[] = []
  const lmByMuscle: Record<string, VolumeLandmark> = {}
  for (const lm of landmarks) lmByMuscle[lm.muscle] = lm

  const schedule = buildSchedule(prefs.split, prefs.days)

  // 1) Weekly set target per muscle (clamped to what frequency allows: max
  //    ~ frequency * per-session ceiling of ~6 sets/muscle/session).
  const weeklyTarget: Record<string, number> = {}
  const allMuscles = [...PUSH_MUSCLES, ...PULL_MUSCLES, ...LOWER_MUSCLES, ...CORE_MUSCLES]
    .filter((m, i, arr) => arr.indexOf(m) === i)
  for (const muscle of allMuscles) {
    const lm = lmByMuscle[muscle]
    if (!lm) continue
    const freq = frequencyForMuscle(muscle, schedule)
    if (freq === 0) continue
    const emphasized = prefs.emphasis.includes(muscle)
    const raw = weeklyTargetSets(lm, prefs, emphasized)
    weeklyTarget[muscle] = Math.min(raw, freq * 6)
  }

  // 2) Per-session muscle allotments. Distribute the weekly target evenly
  //    across the sessions that train that muscle's category.
  // Build, for each muscle, the list of session indices that train it.
  const sessionsForMuscle: Record<string, number[]> = {}
  schedule.forEach((slot, idx) => {
    for (const muscle of allMuscles) {
      if (slot.categories.includes(MUSCLE_CATEGORY[muscle])) {
        (sessionsForMuscle[muscle] ??= []).push(idx)
      }
    }
  })

  // 3) Build each session: choose anchor muscles, pick exercises, allocate sets.
  const usedIds = new Set<string>()
  const sessions: PlannedSession[] = schedule.map(slot => ({
    day_index: 0, day_label: slot.label, split_type: slot.split_type,
    focus_muscles: [], exercises: [],
  }))
  schedule.forEach((_, i) => { sessions[i].day_index = i })

  // Order muscles so anchors get exercises first within each session.
  const musclePriority = (m: string) =>
    [...PUSH_MUSCLES, ...PULL_MUSCLES, ...LOWER_MUSCLES, ...CORE_MUSCLES].indexOf(m)

  for (const muscle of allMuscles) {
    const target = weeklyTarget[muscle]
    if (!target) continue
    const sess = sessionsForMuscle[muscle] ?? []
    if (sess.length === 0) continue

    // Sets per session for this muscle (spread evenly, remainder to early days).
    const base = Math.floor(target / sess.length)
    let rem = target - base * sess.length

    for (const sIdx of sess) {
      let sessionSets = base + (rem > 0 ? 1 : 0)
      if (rem > 0) rem--
      if (sessionSets <= 0) continue

      // # of exercises for this muscle this session: 1 exercise per ~3-4 sets,
      // min 1, max 2 (keeps sessions tight; isolation muscles get 1).
      const exCount = Math.min(2, Math.max(1, Math.round(sessionSets / 3.5)))
      const picks = pickExercisesForMuscle(muscle, library, assessment, exCount, usedIds)
      if (picks.length === 0) {
        notes.push(`No unlocked ${muscle} exercises available — skipped in ${sessions[sIdx].day_label}.`)
        continue
      }

      // Allocate sets across the chosen exercises (3-4 each, balance remainder).
      const perEx = Math.max(2, Math.floor(sessionSets / picks.length))
      let setRem = sessionSets - perEx * picks.length
      picks.forEach(p => {
        p.sets = perEx + (setRem > 0 ? 1 : 0)
        if (setRem > 0) setRem--
      })

      sessions[sIdx].exercises.push(...picks)
      if (!sessions[sIdx].focus_muscles.includes(muscle)) sessions[sIdx].focus_muscles.push(muscle)
    }
  }

  // Order exercises within each session: compounds/anchors first.
  for (const s of sessions) {
    s.exercises.sort((a, b) =>
      musclePriority(a.primary_muscle ?? '') - musclePriority(b.primary_muscle ?? ''))
  }

  // 4) Roll up planned weekly volume per muscle for the editor tally.
  const plannedByMuscle: Record<string, number> = {}
  for (const s of sessions) for (const e of s.exercises) {
    if (e.primary_muscle) plannedByMuscle[e.primary_muscle] = (plannedByMuscle[e.primary_muscle] ?? 0) + e.sets
  }
  const weekly_volume = landmarks
    .filter(lm => plannedByMuscle[lm.muscle] != null || frequencyForMuscle(lm.muscle, schedule) > 0)
    .map(lm => ({ muscle: lm.muscle, planned: plannedByMuscle[lm.muscle] ?? 0, lm }))
    .sort((a, b) => b.planned - a.planned || a.muscle.localeCompare(b.muscle))

  // Coaching summary note.
  const swapCount = sessions.flatMap(s => s.exercises).filter(e => e.swapped_from).length
  if (swapCount > 0) notes.unshift(`${swapCount} exercise${swapCount > 1 ? 's' : ''} auto-swapped to ROM-friendly variations based on your mobility.`)
  const blockNote = prefs.mesoWeeks >= 2
    ? (prefs.mesoWeek === prefs.mesoWeeks ? 'Deload week — volume pulled back to maintenance.' : `Mesocycle week ${prefs.mesoWeek}/${prefs.mesoWeeks} — volume set for this phase.`)
    : 'No active block — volume set to the productive middle of your MAV range.'
  notes.unshift(blockNote)

  const splitLabel = prefs.split === 'full_body' ? 'Full Body' : prefs.split === 'upper_lower' ? 'Upper/Lower' : 'Push/Pull/Legs'
  const program_key = `generated:${crypto.randomUUID()}`

  return {
    program_key,
    name: `${prefs.days}-Day ${splitLabel} (ROM-tuned)`,
    split: prefs.split,
    days: prefs.days,
    tier: prefs.experience,
    meso_week: prefs.mesoWeek,
    meso_weeks: prefs.mesoWeeks,
    sessions,
    weekly_volume,
    notes,
  }
}

// Recompute the weekly-volume tally after the user edits sets in the editor.
export function recomputeWeeklyVolume(
  sessions: PlannedSession[], landmarks: VolumeLandmark[],
): GeneratedProgram['weekly_volume'] {
  const plannedByMuscle: Record<string, number> = {}
  for (const s of sessions) for (const e of s.exercises) {
    if (e.primary_muscle) plannedByMuscle[e.primary_muscle] = (plannedByMuscle[e.primary_muscle] ?? 0) + e.sets
  }
  return landmarks
    .filter(lm => plannedByMuscle[lm.muscle] != null && plannedByMuscle[lm.muscle] > 0)
    .map(lm => ({ muscle: lm.muscle, planned: plannedByMuscle[lm.muscle] ?? 0, lm }))
    .sort((a, b) => b.planned - a.planned || a.muscle.localeCompare(b.muscle))
}
