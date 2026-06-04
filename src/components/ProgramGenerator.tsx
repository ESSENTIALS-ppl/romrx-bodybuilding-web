// ────────────────────────────────────────────────────────────────────────────
//  ProgramGenerator — "auto-gen draft, then edit" hypertrophy program builder.
//
//  Flow:  Wizard (split / days / emphasis)  →  auto-generated draft  →
//         guided editor (±sets, remove, see ROM swaps + live volume tally)  →
//         Save (writes workouts + workout_exercises tagged with a program key,
//         which the Volume "Planned" view and ROMBot both read).
//
//  The heavy lifting lives in lib/programGenerator.ts. This component is the
//  UI shell + persistence.
// ────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import type { Assessment } from '../hooks/useProfile'
import { SectionCard } from './SectionCard'
import { Spinner } from './Spinner'
import { cn } from '../lib/utils'
import {
  Wand2, Trash2, Plus, Minus, ArrowRightLeft, AlertTriangle,
  Check, RefreshCw, Sparkles, Save, Activity,
} from 'lucide-react'
import {
  generateProgram, recomputeWeeklyVolume,
  type GenExercise, type VolumeLandmark, type GeneratorPrefs,
  type GeneratedProgram, type PlannedSession, type SplitType,
} from '../lib/programGenerator'

const SPLIT_OPTIONS: Array<{ key: SplitType; label: string; blurb: string }> = [
  { key: 'full_body', label: 'Full Body', blurb: 'Every muscle each session — great for 2–3 days' },
  { key: 'upper_lower', label: 'Upper / Lower', blurb: 'Balanced frequency — ideal for 4 days' },
  { key: 'ppl', label: 'Push / Pull / Legs', blurb: 'Max volume per muscle — best for 5–6 days' },
]

const EMPHASIS_MUSCLES = ['Chest', 'Back', 'Side Delts', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Abs']

function classifyPlanned(sets: number, lm: VolumeLandmark): { label: string; cls: string; bar: string } {
  if (sets < lm.mev) return { label: 'Below growth', cls: 'text-miami-text/50', bar: 'bg-miami-text/30' }
  if (sets < lm.mav_low) return { label: 'Maintenance', cls: 'text-yellow-tier', bar: 'bg-yellow-tier' }
  if (sets <= lm.mav_high) return { label: 'Productive', cls: 'text-green-tier', bar: 'bg-green-tier' }
  if (sets <= lm.mrv) return { label: 'High', cls: 'text-miami', bar: 'bg-miami' }
  return { label: 'Over MRV', cls: 'text-red-tier', bar: 'bg-red-tier' }
}

export function ProgramGenerator({
  assessment, onSaved,
}: { assessment: Assessment | null; onSaved?: () => void }) {
  const { user } = useAuth()
  const [step, setStep] = useState<'wizard' | 'draft'>('wizard')
  const [library, setLibrary] = useState<GenExercise[]>([])
  const [landmarks, setLandmarks] = useState<VolumeLandmark[]>([])
  const [loading, setLoading] = useState(true)
  const [tier, setTier] = useState<'beginner' | 'intermediate' | 'advanced'>('intermediate')
  const [mesoWeek, setMesoWeek] = useState(1)
  const [mesoWeeks, setMesoWeeks] = useState(0)

  // Wizard prefs
  const [split, setSplit] = useState<SplitType>('upper_lower')
  const [days, setDays] = useState(4)
  const [emphasis, setEmphasis] = useState<string[]>([])

  // Draft + persistence
  const [program, setProgram] = useState<GeneratedProgram | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      const [{ data: lib }, { data: lm }, { data: prof }, { data: meso }] = await Promise.all([
        supabase
          .from('unlocked_techniques_v')
          .select('id, code, name, category, subcategory, tier, hip_er_min, hip_ir_min, hip_abd_min, hip_flex_min, shoulder_er_min, shoulder_flex_min, ankle_df_min, lumbar_flex_min, lumbar_ext_min, cervical_lat_min, cervical_flex_min, cervical_ext_min, primary_muscle, secondary_muscles, stretch_emphasis, limiting_joint, rom_note')
          .eq('sport', 'bodybuilding'),
        supabase.from('muscle_volume_landmarks').select('muscle, mv, mev, mav_low, mav_high, mrv'),
        user?.id
          ? supabase.from('users').select('active_bb_tier').eq('id', user.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from('mesocycles').select('weeks, current_week, status').eq('status', 'active').order('created_at', { ascending: false }).limit(1),
      ])
      if (!active) return
      setLibrary((lib as GenExercise[]) ?? [])
      setLandmarks((lm as VolumeLandmark[]) ?? [])
      const t = (prof as { active_bb_tier?: string } | null)?.active_bb_tier
      if (t === 'beginner' || t === 'intermediate' || t === 'advanced') setTier(t)
      const m = (meso as Array<{ weeks: number; current_week: number }> | null)?.[0]
      if (m) { setMesoWeeks(m.weeks); setMesoWeek(m.current_week) }
      setLoading(false)
    })()
    return () => { active = false }
  }, [user?.id])

  function toggleEmphasis(m: string) {
    setEmphasis(prev => prev.includes(m) ? prev.filter(x => x !== m) : prev.length >= 3 ? prev : [...prev, m])
  }

  function runGenerate() {
    const prefs: GeneratorPrefs = { split, days, emphasis, mesoWeek, mesoWeeks, experience: tier }
    const prog = generateProgram(prefs, library, landmarks, assessment)
    setProgram(prog)
    setStep('draft')
    setSaved(false)
    setError(null)
  }

  // ── Editor mutations ──────────────────────────────────────────────────────
  function mutateSessions(fn: (sessions: PlannedSession[]) => PlannedSession[]) {
    setProgram(prev => {
      if (!prev) return prev
      const sessions = fn(prev.sessions.map(s => ({ ...s, exercises: s.exercises.map(e => ({ ...e })) })))
      return { ...prev, sessions, weekly_volume: recomputeWeeklyVolume(sessions, landmarks) }
    })
  }
  function changeSets(sIdx: number, exIdx: number, delta: number) {
    mutateSessions(sessions => {
      const ex = sessions[sIdx].exercises[exIdx]
      ex.sets = Math.max(1, Math.min(8, ex.sets + delta))
      return sessions
    })
  }
  function removeExercise(sIdx: number, exIdx: number) {
    mutateSessions(sessions => {
      sessions[sIdx].exercises.splice(exIdx, 1)
      sessions[sIdx].focus_muscles = [...new Set(sessions[sIdx].exercises.map(e => e.primary_muscle).filter(Boolean) as string[])]
      return sessions
    })
  }

  // ── Save: replace any existing generated program, write fresh ─────────────
  async function save() {
    if (!program || !user?.id) return
    setSaving(true); setError(null)
    try {
      // Remove previous generated workouts (their child rows cascade or are removed by FK).
      const { data: old } = await supabase
        .from('workouts')
        .select('id')
        .eq('user_id', user.id)
        .eq('is_template', false)
        .like('source_program', 'generated:%')
      if (old && old.length > 0) {
        const ids = old.map(o => o.id)
        await supabase.from('workout_exercises').delete().in('workout_id', ids)
        await supabase.from('workouts').delete().in('id', ids)
      }

      // Insert new workouts + exercises, session by session.
      for (const s of program.sessions) {
        const { data: w, error: wErr } = await supabase
          .from('workouts')
          .insert({
            user_id: user.id,
            sport: 'bodybuilding',
            tier: program.tier,
            name: `${program.name} · ${s.day_label}`,
            description: `Auto-generated · ${s.focus_muscles.join(', ')}`,
            day_label: s.day_label,
            split_type: s.split_type,
            is_template: false,
            source_program: program.program_key,
            notes: program.notes.join(' '),
          })
          .select('id')
          .single()
        if (wErr) throw wErr
        const rows = s.exercises.map((e, i) => ({
          workout_id: w.id,
          technique_id: e.technique_id,
          exercise_name: e.exercise_name,
          position: i + 1,
          sets: e.sets,
          reps_min: e.reps_min,
          reps_max: e.reps_max,
          rest_seconds_min: e.rest_min,
          rest_seconds_max: e.rest_max,
          target_notes: e.note,
        }))
        if (rows.length > 0) {
          const { error: exErr } = await supabase.from('workout_exercises').insert(rows)
          if (exErr) throw exErr
        }
      }
      setSaved(true)
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save program')
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <Spinner />

  const noAssessment = !assessment

  // ── Wizard ────────────────────────────────────────────────────────────────
  if (step === 'wizard') {
    return (
      <div className="space-y-4">
        <SectionCard
          title={<span className="flex items-center gap-2"><Wand2 size={16} className="text-miami" /> Generate a program</span>}
        >
          <p className="text-xs text-miami-text/70 mb-4">
            We auto-build a full week around your mobility — picking growth-driving, stretch-biased lifts you can actually load through range, then setting volume per muscle to your science-based MAV. You can tweak everything before saving.
            {noAssessment && (
              <span className="block mt-1 text-yellow-tier">
                Complete your ROM assessment to unlock readiness-aware exercise selection. We'll still build a solid plan without it.
              </span>
            )}
          </p>

          {/* Split */}
          <p className="text-[11px] font-bold uppercase tracking-wide text-miami-text/50 mb-1.5">Split</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
            {SPLIT_OPTIONS.map(o => (
              <button
                key={o.key}
                onClick={() => { setSplit(o.key); if (o.key === 'ppl' && days < 5) setDays(6); if (o.key === 'full_body' && days > 3) setDays(3) }}
                className={cn(
                  'text-left rounded-xl border p-3 transition-colors',
                  split === o.key
                    ? 'border-miami bg-miami/10'
                    : 'border-miami-violet/25 bg-miami-ink/60 hover:border-miami-violet/50',
                )}
              >
                <p className="text-sm font-semibold text-miami-text">{o.label}</p>
                <p className="text-[11px] text-miami-text/60 mt-0.5">{o.blurb}</p>
              </button>
            ))}
          </div>

          {/* Days */}
          <p className="text-[11px] font-bold uppercase tracking-wide text-miami-text/50 mb-1.5">Days per week</p>
          <div className="flex items-center gap-1.5 mb-4">
            {[2, 3, 4, 5, 6].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  'w-10 h-10 rounded-lg text-sm font-bold transition-colors',
                  days === d ? 'bg-miami text-white' : 'bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30',
                )}
              >
                {d}
              </button>
            ))}
          </div>

          {/* Emphasis */}
          <p className="text-[11px] font-bold uppercase tracking-wide text-miami-text/50 mb-1.5">
            Emphasis <span className="font-normal normal-case text-miami-text/40">· optional, up to 3 — biases volume higher</span>
          </p>
          <div className="flex flex-wrap gap-1.5 mb-5">
            {EMPHASIS_MUSCLES.map(m => (
              <button
                key={m}
                onClick={() => toggleEmphasis(m)}
                className={cn(
                  'text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors',
                  emphasis.includes(m) ? 'bg-miami text-white' : 'bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30',
                )}
              >
                {m}
              </button>
            ))}
          </div>

          {mesoWeeks >= 2 && (
            <div className="rounded-lg bg-miami-violet/10 border border-miami-violet/20 px-3 py-2 mb-4 text-xs text-miami-text/80 flex items-center gap-2">
              <Activity size={13} className="text-miami shrink-0" />
              Tuning volume for mesocycle week {mesoWeek} of {mesoWeeks}
              {mesoWeek === mesoWeeks && <span className="text-yellow-tier font-semibold">· deload</span>}
            </div>
          )}

          <button
            onClick={runGenerate}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-miami to-miami-violet text-white font-bold text-sm shadow-[0_0_20px_-4px_rgba(255,45,120,0.6)] hover:shadow-[0_0_28px_-4px_rgba(255,45,120,0.8)] transition-all flex items-center justify-center gap-2"
          >
            <Sparkles size={15} /> Generate my program
          </button>
        </SectionCard>
      </div>
    )
  }

  // ── Draft + editor ─────────────────────────────────────────────────────────
  if (!program) return null
  return (
    <div className="space-y-4">
      {/* Header / actions */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-miami-text">{program.name}</p>
          <p className="text-xs text-miami-text/60">{program.days} days · tweak sets and exercises, then save</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStep('wizard')}
            className="text-xs font-semibold px-3 py-2 rounded-lg bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30 flex items-center gap-1.5"
          >
            <RefreshCw size={13} /> Regenerate
          </button>
          <button
            onClick={save}
            disabled={saving}
            className={cn(
              'text-xs font-bold px-4 py-2 rounded-lg flex items-center gap-1.5 transition-colors',
              saved ? 'bg-green-tier-bg text-green-tier border border-green-tier/40'
                : 'bg-gradient-to-r from-miami to-miami-violet text-white disabled:opacity-50',
            )}
          >
            {saved ? <><Check size={14} /> Saved to My Workouts</> : saving ? 'Saving…' : <><Save size={14} /> Save program</>}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-tier-bg border border-red-tier/30 text-red-tier px-3 py-2 text-sm">{error}</div>
      )}

      {/* Generation notes */}
      {program.notes.length > 0 && (
        <div className="rounded-lg bg-miami-violet/10 border border-miami-violet/20 px-3 py-2 space-y-1">
          {program.notes.map((n, i) => (
            <p key={i} className="text-[11px] text-miami-text/75 flex items-start gap-1.5">
              <Sparkles size={11} className="text-miami mt-0.5 shrink-0" /> {n}
            </p>
          ))}
        </div>
      )}

      {/* Live weekly volume tally */}
      <WeeklyVolumeTally program={program} />

      {/* Sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {program.sessions.map((s, sIdx) => (
          <SessionCard
            key={sIdx}
            session={s}
            onSets={(exIdx, d) => changeSets(sIdx, exIdx, d)}
            onRemove={exIdx => removeExercise(sIdx, exIdx)}
          />
        ))}
      </div>
    </div>
  )
}

// ── Weekly volume tally (planned sets vs landmarks) ──────────────────────────

function WeeklyVolumeTally({ program }: { program: GeneratedProgram }) {
  const rows = program.weekly_volume
  return (
    <SectionCard
      title={<span className="flex items-center gap-2 text-sm"><Activity size={14} className="text-miami" /> Planned weekly volume</span>}
    >
      <div className="flex flex-wrap items-center gap-3 text-[10px] text-miami-text/70 mb-3">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2.5 rounded-sm bg-yellow-tier" /> Maintenance</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2.5 rounded-sm bg-green-tier" /> Productive (MAV)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2.5 rounded-sm bg-miami" /> High (→MRV)</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2.5 rounded-sm bg-red-tier" /> Over MRV</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-2.5">
        {rows.map(({ muscle, planned, lm }) => {
          const c = classifyPlanned(planned, lm)
          const scaleMax = Math.max(lm.mrv * 1.1, planned)
          const pct = scaleMax > 0 ? Math.min(100, (planned / scaleMax) * 100) : 0
          const mavLowPct = scaleMax > 0 ? (lm.mav_low / scaleMax) * 100 : 0
          const mavHighPct = scaleMax > 0 ? (lm.mav_high / scaleMax) * 100 : 0
          return (
            <div key={muscle}>
              <div className="flex items-center justify-between text-[11px] mb-1">
                <span className="font-semibold text-miami-text">{muscle}</span>
                <span className="tabular-nums">
                  <span className="font-bold text-miami-text">{planned}</span>
                  <span className="text-miami-text/40"> / {lm.mav_low}–{lm.mav_high}</span>
                  <span className={cn('ml-1.5 font-semibold', c.cls)}>{c.label}</span>
                </span>
              </div>
              <div className="relative h-2.5 rounded-full bg-miami-bg overflow-hidden">
                <div className="absolute inset-y-0 bg-green-tier/10" style={{ left: `${mavLowPct}%`, width: `${Math.max(0, mavHighPct - mavLowPct)}%` }} />
                <div className={cn('absolute inset-y-0 left-0 rounded-full', c.bar)} style={{ width: `${pct}%` }} />
              </div>
            </div>
          )
        })}
      </div>
    </SectionCard>
  )
}

// ── Session card with inline editing ─────────────────────────────────────────

function SessionCard({
  session, onSets, onRemove,
}: {
  session: PlannedSession
  onSets: (exIdx: number, delta: number) => void
  onRemove: (exIdx: number) => void
}) {
  const totalSets = useMemo(() => session.exercises.reduce((s, e) => s + e.sets, 0), [session])
  return (
    <div className="rounded-2xl border border-miami-violet/20 bg-miami-ink/70 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-bold text-miami-text">{session.day_label}</p>
        <span className="text-[10px] text-miami-text/50 tabular-nums">{totalSets} sets · {session.exercises.length} lifts</span>
      </div>
      {session.focus_muscles.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {session.focus_muscles.map(m => (
            <span key={m} className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-miami-violet/15 text-miami-text/80">{m}</span>
          ))}
        </div>
      )}
      <div className="space-y-2">
        {session.exercises.map((e, exIdx) => {
          const isRed = e.readiness != null && e.readiness < 75
          return (
            <div key={exIdx} className="rounded-lg bg-miami-bg/40 border border-miami-violet/15 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-miami-text leading-tight">{e.exercise_name}</p>
                  <p className="text-[10px] text-miami-text/55 mt-0.5">
                    {e.primary_muscle} · {e.reps_min}–{e.reps_max} reps
                    {e.readiness != null && (
                      <span className={cn('ml-1 font-semibold', e.readiness >= 90 ? 'text-green-tier' : e.readiness >= 75 ? 'text-yellow-tier' : 'text-red-tier')}>
                        · {e.readiness}% ready
                      </span>
                    )}
                  </p>
                </div>
                {/* Set stepper */}
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => onSets(exIdx, -1)} className="w-6 h-6 rounded bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30 flex items-center justify-center">
                    <Minus size={12} />
                  </button>
                  <span className="w-6 text-center text-sm font-bold text-miami-text tabular-nums">{e.sets}</span>
                  <button onClick={() => onSets(exIdx, 1)} className="w-6 h-6 rounded bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30 flex items-center justify-center">
                    <Plus size={12} />
                  </button>
                  <button onClick={() => onRemove(exIdx)} className="w-6 h-6 rounded text-miami-text/40 hover:text-red-tier hover:bg-red-tier-bg flex items-center justify-center ml-0.5">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
              {/* ROM swap / mobility note */}
              {e.swapped_from && (
                <p className="mt-1.5 text-[10px] text-green-tier flex items-start gap-1">
                  <ArrowRightLeft size={10} className="mt-0.5 shrink-0" />
                  <span>Swapped from <span className="font-semibold">{e.swapped_from}</span> — same target, no mobility tax.</span>
                </p>
              )}
              {!e.swapped_from && isRed && (
                <p className="mt-1.5 text-[10px] text-red-tier flex items-start gap-1">
                  <AlertTriangle size={10} className="mt-0.5 shrink-0" />
                  <span>{e.note ?? 'Mobility-limited — reduce range to a pain-free depth.'}</span>
                </p>
              )}
              {!e.swapped_from && !isRed && e.stretch_emphasis === 'high' && (
                <p className="mt-1.5 text-[10px] text-miami flex items-center gap-1">
                  <Sparkles size={10} className="shrink-0" /> High-stretch — drives growth at length.
                </p>
              )}
            </div>
          )
        })}
        {session.exercises.length === 0 && (
          <p className="text-xs text-miami-text/50 italic py-2">No exercises — regenerate or pick from the library.</p>
        )}
      </div>
    </div>
  )
}
