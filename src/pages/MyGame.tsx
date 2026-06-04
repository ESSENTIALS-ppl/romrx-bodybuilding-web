// MyGame on the BB site renders as "My Training" (sport_config.game_label).
// This is the BB-native workout & exercise browser. The legacy BJJ MyGame
// implementation lives in git history; this file replaces it for the
// romrxbodybuilding.com build.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProfile, type Assessment } from '../hooks/useProfile'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { cn, bbTierLabel, bbTierColor } from '../lib/utils'
import {
  Dumbbell, Layers, BookOpen, Copy, Check, ChevronRight,
  Plus, Search, Filter, Sparkles, AlertTriangle, BarChart3, ArrowRightLeft, Activity, Wand2,
} from 'lucide-react'
import { ProgramGenerator } from '../components/ProgramGenerator'

// ────────────────────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────────────────────

interface WorkoutTemplate {
  id: string
  sport: string
  tier: string | null
  name: string
  description: string | null
  day_label: string | null
  split_type: string | null
  source_program: string | null
  notes: string | null
  is_template: boolean
}

interface WorkoutExercise {
  id: string
  workout_id: string
  position: number
  exercise_name: string
  sets: number | null
  reps_min: number | null
  reps_max: number | null
  rest_seconds_min: number | null
  rest_seconds_max: number | null
  target_notes: string | null
  technique_id: string | null
}

interface UnlockedTechnique {
  id: string
  code: string
  name: string
  category: string | null
  subcategory: string | null
  sport: string
  tier: string | null
  // ROM minimums — used to compute traffic-light readiness vs user's assessment.
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
  // Hypertrophy muscle / stretch metadata (BB build).
  primary_muscle: string | null
  secondary_muscles: string[] | null
  stretch_emphasis: string | null      // 'high' | 'medium' | 'low'
  limiting_joint: string | null        // 'ankle_df' | 'hip_flex' | 'shoulder_flex' | 'shoulder_er'
  rom_note: string | null
}

// Human-readable joint labels for ROM alerts.
const JOINT_LABEL: Record<string, string> = {
  ankle_df: 'ankle dorsiflexion',
  hip_flex: 'hip flexion',
  shoulder_flex: 'shoulder flexion',
  shoulder_er: 'shoulder external rotation',
  hip_er: 'hip external rotation',
  hip_ir: 'hip internal rotation',
  hip_abd: 'hip abduction',
  lumbar_flex: 'lumbar flexion',
  lumbar_ext: 'lumbar extension',
}

const STRETCH_LABEL: Record<string, { label: string; cls: string }> = {
  high:   { label: 'High stretch', cls: 'bg-miami/20 text-miami' },
  medium: { label: 'Mod stretch',  cls: 'bg-miami-violet/20 text-miami-violet' },
  low:    { label: 'Peak / short', cls: 'bg-miami-violet/10 text-miami-text/60' },
}

// Each tuple: (assessment best-side value getter, technique min column)
const JOINT_MAP: ReadonlyArray<{
  pick: (a: Assessment) => number | null
  minKey: keyof UnlockedTechnique
}> = [
  { pick: a => bestBilateral(a.hip_er_l, a.hip_er_r),                 minKey: 'hip_er_min' },
  { pick: a => bestBilateral(a.hip_ir_l, a.hip_ir_r),                 minKey: 'hip_ir_min' },
  { pick: a => bestBilateral(a.hip_abd_l, a.hip_abd_r),               minKey: 'hip_abd_min' },
  { pick: a => bestBilateral(a.hip_flex_l, a.hip_flex_r),             minKey: 'hip_flex_min' },
  { pick: a => bestBilateral(a.shoulder_er_l, a.shoulder_er_r),       minKey: 'shoulder_er_min' },
  { pick: a => bestBilateral(a.shoulder_flex_l, a.shoulder_flex_r),   minKey: 'shoulder_flex_min' },
  { pick: a => bestBilateral(a.ankle_df_l, a.ankle_df_r),             minKey: 'ankle_df_min' },
  { pick: a => a.lumbar_flex,                                         minKey: 'lumbar_flex_min' },
  { pick: a => a.lumbar_ext,                                          minKey: 'lumbar_ext_min' },
  { pick: a => bestBilateral(a.cervical_lat_l, a.cervical_lat_r),     minKey: 'cervical_lat_min' },
  { pick: a => a.cervical_flex,                                       minKey: 'cervical_flex_min' },
  { pick: a => a.cervical_ext,                                        minKey: 'cervical_ext_min' },
]

function bestBilateral(l: number | null, r: number | null): number | null {
  if (l == null && r == null) return null
  return Math.max(l ?? 0, r ?? 0)
}

/**
 * Compute readiness % for one technique vs the user's assessment.
 * Overall readiness = MIN(joint%) across all joints with a *_min requirement.
 * Returns null when the technique has no ROM requirements (treat as universally ready).
 */
function computeReadiness(tech: UnlockedTechnique, a: Assessment | null): number | null {
  if (!a) return null
  let worst = 100
  let hadAny = false
  for (const { pick, minKey } of JOINT_MAP) {
    const required = tech[minKey] as number | null
    if (required == null || required <= 0) continue
    hadAny = true
    const userValue = pick(a)
    if (userValue == null || userValue <= 0) {
      // No data on this joint — treat as severe limitation.
      return 0
    }
    const pct = Math.min(100, Math.round((userValue / required) * 100))
    if (pct < worst) worst = pct
  }
  return hadAny ? worst : null
}

/**
 * Traffic-light border based on readiness pct.
 * ≥ 90 → green (ready), 75-89 → yellow (caution), < 75 → red (work mobility first).
 * null → neutral violet hairline.
 */
function readinessBorder(pct: number | null): string {
  if (pct == null) return 'border-l-4 border-miami-violet/40'
  if (pct >= 90)   return 'border-l-4 border-green-tier'
  if (pct >= 75)   return 'border-l-4 border-yellow-tier'
  return 'border-l-4 border-red-tier'
}

function readinessLabel(pct: number | null): string | null {
  if (pct == null) return null
  if (pct >= 90) return 'Ready'
  if (pct >= 75) return 'Caution'
  return 'Mobility first'
}

function readinessTextClass(pct: number | null): string {
  if (pct == null) return 'text-miami-text/50'
  if (pct >= 90) return 'text-green-tier'
  if (pct >= 75) return 'text-yellow-tier'
  return 'text-red-tier'
}

function readinessBgClass(pct: number | null): string {
  if (pct == null) return 'bg-miami-violet/15 text-miami-text/70'
  if (pct >= 90) return 'bg-green-tier-bg text-green-tier'
  if (pct >= 75) return 'bg-yellow-tier-bg text-yellow-tier'
  return 'bg-red-tier-bg text-red-tier'
}

// ────────────────────────────────────────────────────────────────────────────
//  Helpers
// ────────────────────────────────────────────────────────────────────────────

const SPLIT_LABEL: Record<string, string> = {
  full_body: 'Full Body',
  upper_lower: 'Upper / Lower',
  ppl_specialization: 'Push / Pull / Legs',
}

const TIER_ORDINAL: Record<string, number> = {
  beginner: 1, intermediate: 2, advanced: 3,
}

// Subtle accent border for *programs* by tier — NOT the same vocabulary as
// the traffic-light readiness used for exercise cards. Single brand-aligned
// color with varying intensity so it can't be confused with red/yellow/green.
function programTierBorder(tier: string | null | undefined): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'beginner':     return 'border-l-4 border-miami-violet/40'
    case 'intermediate': return 'border-l-4 border-miami-violet/70'
    case 'advanced':     return 'border-l-4 border-miami'
    default:             return 'border-l-4 border-miami-violet/20'
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Main page
// ────────────────────────────────────────────────────────────────────────────

type TabKey = 'generate' | 'templates' | 'mine' | 'library' | 'volume'

export function MyGame() {
  const { user } = useAuth()
  const { profile, assessment, loading: profileLoading } = useProfile(user?.id)
  const [tab, setTab] = useState<TabKey>('generate')

  if (profileLoading) return <Spinner />

  const userTier = profile?.active_bb_tier ?? null

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Training"
        subtitle="Hypertrophy programs built around your mobility"
        badge={bbTierLabel(userTier)}
        badgeColor={bbTierColor(userTier)}
        action={
          <a
            href="/dashboard/workout"
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-miami to-miami-violet text-white font-bold text-sm shadow-[0_0_20px_-4px_rgba(255,45,120,0.6)] hover:shadow-[0_0_28px_-4px_rgba(255,45,120,0.8)] transition-all inline-flex items-center gap-2"
          >
            <Dumbbell size={14} /> Log Workout
          </a>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-miami-light overflow-x-auto scrollbar-none">
        <TabBtn active={tab === 'generate'} onClick={() => setTab('generate')} icon={Wand2}>
          Generate
        </TabBtn>
        <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')} icon={Layers}>
          Templates
        </TabBtn>
        <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')} icon={Dumbbell}>
          My Workouts
        </TabBtn>
        <TabBtn active={tab === 'library'} onClick={() => setTab('library')} icon={BookOpen}>
          Exercise Library
        </TabBtn>
        <TabBtn active={tab === 'volume'} onClick={() => setTab('volume')} icon={BarChart3}>
          Volume
        </TabBtn>
      </div>

      {tab === 'generate' && <ProgramGenerator assessment={assessment} onSaved={() => setTab('mine')} />}
      {tab === 'templates' && <TemplatesPanel userTier={userTier} />}
      {tab === 'mine' && <MyWorkoutsPanel userId={user?.id} />}
      {tab === 'library' && <ExerciseLibraryPanel assessment={assessment} />}
      {tab === 'volume' && <VolumePanel />}
    </div>
  )
}

function TabBtn({
  active, onClick, icon: Icon, children,
}: { active: boolean; onClick: () => void; icon: React.ComponentType<{ size?: number }>; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1.5 px-3 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
        active
          ? 'border-miami text-miami'
          : 'border-transparent text-miami-text/60 hover:text-miami',
      )}
    >
      <Icon size={14} />
      {children}
    </button>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Templates panel — browse + clone the 11 BB workout templates
// ────────────────────────────────────────────────────────────────────────────

function TemplatesPanel({ userTier }: { userTier: string | null }) {
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [exercises, setExercises] = useState<Record<string, WorkoutExercise[]>>({})
  const [cloning, setCloning] = useState<string | null>(null)
  const [cloned, setCloned] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('workouts')
      .select('id, sport, tier, name, description, day_label, split_type, source_program, notes, is_template')
      .eq('sport', 'bodybuilding')
      .eq('is_template', true)
      .then(({ data, error }) => {
        if (!active) return
        if (error) setError(error.message)
        else setTemplates((data as WorkoutTemplate[]) ?? [])
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  const grouped = useMemo(() => {
    const order = ['beginner', 'intermediate', 'advanced']
    const map: Record<string, WorkoutTemplate[]> = {}
    for (const t of templates) {
      const k = t.tier ?? 'other'
      if (!map[k]) map[k] = []
      map[k].push(t)
    }
    Object.values(map).forEach(arr => arr.sort(
      (a, b) => (a.day_label ?? '').localeCompare(b.day_label ?? '')
    ))
    return order.filter(k => map[k]?.length).map(k => [k, map[k]] as const)
  }, [templates])

  async function loadExercises(workoutId: string) {
    if (exercises[workoutId]) return
    const { data, error } = await supabase
      .from('workout_exercises')
      .select('id, workout_id, position, exercise_name, sets, reps_min, reps_max, rest_seconds_min, rest_seconds_max, target_notes, technique_id')
      .eq('workout_id', workoutId)
      .order('position')
    if (error) {
      console.error('Failed loading exercises:', error.message)
      return
    }
    setExercises(prev => ({ ...prev, [workoutId]: (data as WorkoutExercise[]) ?? [] }))
  }

  function toggle(id: string) {
    if (expanded === id) {
      setExpanded(null)
    } else {
      setExpanded(id)
      loadExercises(id)
    }
  }

  async function clone(templateId: string) {
    setCloning(templateId)
    setError(null)
    const { data, error } = await supabase.rpc('clone_workout_template', { p_template_id: templateId })
    setCloning(null)
    if (error) {
      setError(error.message)
      return
    }
    if (data) {
      setCloned(prev => ({ ...prev, [templateId]: true }))
      setTimeout(() => setCloned(prev => ({ ...prev, [templateId]: false })), 2500)
    }
  }

  if (loading) return <Spinner />

  if (templates.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No templates yet"
        description="Bodybuilding workout templates haven't been loaded into your database."
      />
    )
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-tier-bg border border-red-tier/30 text-red-tier px-3 py-2 text-sm">
          {error}
        </div>
      )}

      {grouped.map(([tier, list]) => {
        const locked = userTier
          ? (TIER_ORDINAL[tier] ?? 99) > (TIER_ORDINAL[userTier] ?? 0)
          : false
        return (
          <SectionCard
            key={tier}
            title={
              <span className="flex items-center gap-2">
                <span className={cn('inline-block w-2 h-2 rounded-full',
                  tier === 'beginner' ? 'bg-miami-violet/50'
                  : tier === 'intermediate' ? 'bg-miami-violet'
                  : 'bg-miami')} />
                <span className="capitalize">{tier} hypertrophy</span>
                <span className="text-xs font-normal text-miami-text/60">
                  · {SPLIT_LABEL[list[0]?.split_type ?? ''] ?? '—'}
                </span>
                {locked && <span className="text-xs bg-miami-violet/15 text-miami-text/70 px-2 py-0.5 rounded-full">Above your tier</span>}
              </span>
            }
          >
            <div className="divide-y divide-miami-violet/15">
              {list.map(t => {
                const isOpen = expanded === t.id
                const ex = exercises[t.id]
                return (
                  <div key={t.id}>
                    <button
                      onClick={() => toggle(t.id)}
                      className={cn(
                        'w-full text-left py-3 pl-3 pr-2 flex items-center gap-3 hover:bg-miami-violet/10 transition-colors rounded-lg',
                        programTierBorder(t.tier),
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-miami-text truncate">{t.day_label}</p>
                        {t.description && (
                          <p className="text-xs text-miami-text/60 mt-0.5 truncate">{t.description}</p>
                        )}
                      </div>
                      <ChevronRight
                        size={16}
                        className={cn('text-miami-text/60 transition-transform shrink-0', isOpen && 'rotate-90')}
                      />
                    </button>

                    {isOpen && (
                      <div className="bg-miami-violet/10 px-3 py-3 space-y-2 rounded-lg">
                        {!ex && <Spinner />}
                        {ex && ex.length === 0 && (
                          <p className="text-xs text-miami-text/60 italic">No exercises in this template.</p>
                        )}
                        {ex && ex.length > 0 && (
                          <ol className="space-y-1.5 text-sm">
                            {ex.map(e => (
                              <li key={e.id} className="flex items-start gap-2">
                                <span className="text-miami font-bold w-5 shrink-0">{e.position}.</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-miami-text">{e.exercise_name}</p>
                                  <p className="text-xs text-miami-text/60">
                                    {e.sets ?? '?'} × {e.reps_min ?? '?'}–{e.reps_max ?? '?'}
                                    {e.rest_seconds_min && e.rest_seconds_max
                                      ? ` · ${e.rest_seconds_min}–${e.rest_seconds_max}s rest`
                                      : ''}
                                    {e.target_notes ? ` · ${e.target_notes}` : ''}
                                  </p>
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                        <div className="pt-2 flex justify-end">
                          <button
                            onClick={() => clone(t.id)}
                            disabled={cloning === t.id || locked}
                            className={cn(
                              'flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors',
                              locked
                                ? 'bg-miami-violet/10 text-miami-text/40 cursor-not-allowed'
                                : cloned[t.id]
                                ? 'bg-green-tier-bg text-green-tier'
                                : 'bg-miami text-white hover:bg-miami-dark',
                            )}
                          >
                            {locked
                              ? 'Tier locked'
                              : cloned[t.id]
                              ? (<><Check size={12} /> Added to My Workouts</>)
                              : cloning === t.id
                              ? 'Adding…'
                              : (<><Copy size={12} /> Add to My Workouts</>)
                            }
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  My Workouts — user-owned clones
// ────────────────────────────────────────────────────────────────────────────

function MyWorkoutsPanel({ userId }: { userId: string | undefined }) {
  const [items, setItems] = useState<WorkoutTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [exercises, setExercises] = useState<Record<string, WorkoutExercise[]>>({})
  const navigate = useNavigate()

  useEffect(() => {
    if (!userId) return
    let active = true
    setLoading(true)
    supabase
      .from('workouts')
      .select('id, sport, tier, name, description, day_label, split_type, source_program, notes, is_template')
      .eq('user_id', userId)
      .eq('is_template', false)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!active) return
        setItems((data as WorkoutTemplate[]) ?? [])
        setLoading(false)
      })
    return () => { active = false }
  }, [userId])

  async function loadExercises(workoutId: string) {
    if (exercises[workoutId]) return
    const { data } = await supabase
      .from('workout_exercises')
      .select('id, workout_id, position, exercise_name, sets, reps_min, reps_max, rest_seconds_min, rest_seconds_max, target_notes, technique_id')
      .eq('workout_id', workoutId)
      .order('position')
    setExercises(prev => ({ ...prev, [workoutId]: (data as WorkoutExercise[]) ?? [] }))
  }

  function toggle(id: string) {
    if (expanded === id) { setExpanded(null) }
    else { setExpanded(id); loadExercises(id) }
  }

  // Group generated-program sessions together so a program reads as one block.
  const groups = useMemo(() => {
    const gen: WorkoutTemplate[] = []
    const other: WorkoutTemplate[] = []
    for (const w of items) {
      if ((w.source_program ?? '').startsWith('generated:')) gen.push(w)
      else other.push(w)
    }
    return { gen, other }
  }, [items])

  if (loading) return <Spinner />

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No workouts yet"
        description="Generate a ROM-tuned program in the Generate tab, or add a template from Templates."
        action={
          <button onClick={() => navigate('?')} className="btn-primary text-sm">
            <Plus size={14} className="inline mr-1" /> Browse templates
          </button>
        }
      />
    )
  }

  const renderCard = (w: WorkoutTemplate) => {
    const isOpen = expanded === w.id
    const ex = exercises[w.id]
    return (
      <div
        key={w.id}
        className={cn(
          'rounded-2xl border border-miami-violet/20 bg-miami-ink/70 overflow-hidden transition-shadow',
          isOpen && 'shadow-[0_0_20px_-6px_rgba(255,45,120,0.45)]',
          programTierBorder(w.tier),
        )}
      >
        <button
          onClick={() => toggle(w.id)}
          className="w-full text-left p-4 flex items-start justify-between gap-2 hover:bg-miami-violet/10 transition-colors"
        >
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-miami-text text-sm">{w.name}</p>
            {w.description && <p className="text-xs text-miami-text/60 mt-1 line-clamp-2">{w.description}</p>}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-[10px] uppercase tracking-wide font-bold text-miami bg-miami/15 px-2 py-0.5 rounded-full">{w.tier}</span>
            <ChevronRight size={16} className={cn('text-miami-text/60 transition-transform', isOpen && 'rotate-90')} />
          </div>
        </button>

        {isOpen && (
          <div className="bg-miami-violet/10 px-4 pb-4 pt-1 space-y-2">
            {!ex && <Spinner />}
            {ex && ex.length === 0 && <p className="text-xs text-miami-text/60 italic">No exercises in this workout.</p>}
            {ex && ex.length > 0 && (
              <ol className="space-y-1.5 text-sm">
                {ex.map(e => (
                  <li key={e.id} className="flex items-start gap-2">
                    <span className="text-miami font-bold w-5 shrink-0">{e.position}.</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-miami-text">{e.exercise_name}</p>
                      <p className="text-xs text-miami-text/60">
                        {e.sets ?? '?'} × {e.reps_min ?? '?'}–{e.reps_max ?? '?'}
                        {e.rest_seconds_min && e.rest_seconds_max ? ` · ${e.rest_seconds_min}–${e.rest_seconds_max}s rest` : ''}
                        {e.target_notes ? ` · ${e.target_notes}` : ''}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
            <div className="pt-2 flex justify-end">
              <a
                href={`/dashboard/workout?w=${w.id}&name=${encodeURIComponent(w.name)}`}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-miami text-white hover:bg-miami-dark transition-colors"
              >
                <Dumbbell size={12} /> Log this workout
              </a>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {groups.gen.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-miami-text/50 mb-2">Your generated program</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{groups.gen.map(renderCard)}</div>
        </div>
      )}
      {groups.other.length > 0 && (
        <div>
          {groups.gen.length > 0 && <p className="text-xs font-bold uppercase tracking-wide text-miami-text/50 mb-2">Other workouts</p>}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">{groups.other.map(renderCard)}</div>
        </div>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Exercise Library — unlocked_techniques_v filtered to BB techs at user's tier
// ────────────────────────────────────────────────────────────────────────────

const BB_CATEGORIES = ['Push', 'Pull', 'Lower', 'Core'] as const
type Category = typeof BB_CATEGORIES[number] | 'All'

function ExerciseLibraryPanel({ assessment }: { assessment: Assessment | null }) {
  const [items, setItems] = useState<UnlockedTechnique[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<Category>('All')
  const [q, setQ] = useState('')
  const [readyOnly, setReadyOnly] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    // unlocked_techniques_v is already filtered server-side by the user's
    // active_sport + active_bb_tier (see fix in PR #1).
    // We also pull *_min columns so we can compute traffic-light readiness
    // client-side using the user's assessment.
    supabase
      .from('unlocked_techniques_v')
      .select('id, code, name, category, subcategory, sport, tier, hip_er_min, hip_ir_min, hip_abd_min, hip_flex_min, shoulder_er_min, shoulder_flex_min, ankle_df_min, lumbar_flex_min, lumbar_ext_min, cervical_lat_min, cervical_flex_min, cervical_ext_min, primary_muscle, secondary_muscles, stretch_emphasis, limiting_joint, rom_note')
      .eq('sport', 'bodybuilding')
      .order('category')
      .order('name')
      .then(({ data }) => {
        if (!active) return
        setItems((data as UnlockedTechnique[]) ?? [])
        setLoading(false)
      })
    return () => { active = false }
  }, [])

  // Decorate items with their readiness pct (computed once when items or
  // assessment changes), then filter.
  const decorated = useMemo(
    () => items.map(it => ({ it, pct: computeReadiness(it, assessment) })),
    [items, assessment],
  )

  // Find a same-muscle substitution with a LOWER stretch demand (and ideally
  // no requirement on the limiting joint). This is the ROM differentiator:
  // when a lifter can't reach the stretch, route them to a movement that hits
  // the same muscle without the mobility tax.
  const findSubstitution = useMemo(() => {
    const stretchRank: Record<string, number> = { high: 3, medium: 2, low: 1 }
    return (target: UnlockedTechnique): UnlockedTechnique | null => {
      if (!target.primary_muscle) return null
      const targetStretch = stretchRank[target.stretch_emphasis ?? 'medium'] ?? 2
      const candidates = items
        .filter(c =>
          c.id !== target.id &&
          c.primary_muscle === target.primary_muscle &&
          // Lower stretch demand than the target
          (stretchRank[c.stretch_emphasis ?? 'medium'] ?? 2) < targetStretch &&
          // And readiness is green/neutral for the user
          (computeReadiness(c, assessment) ?? 100) >= 90,
        )
        // Prefer the candidate that still keeps the most stretch (closest below)
        .sort((a, b) =>
          (stretchRank[b.stretch_emphasis ?? 'low'] ?? 1) - (stretchRank[a.stretch_emphasis ?? 'low'] ?? 1),
        )
      return candidates[0] ?? null
    }
  }, [items, assessment])

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return decorated.filter(({ it, pct }) => {
      if (cat !== 'All' && it.category !== cat) return false
      if (needle && !it.name.toLowerCase().includes(needle)) return false
      if (readyOnly && (pct == null || pct < 90)) return false
      return true
    })
  }, [decorated, cat, q, readyOnly])

  if (loading) return <Spinner />

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Sparkles}
        title="Set your tier to unlock exercises"
        description="Pick beginner, intermediate, or advanced in Settings to see your exercise library."
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-miami-text/60" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search exercises…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-miami-violet/30 focus:outline-none focus:border-miami transition-colors bg-miami-ink/60 text-miami-text placeholder:text-miami-text/40"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-miami-text/60 mr-1" />
          {(['All', ...BB_CATEGORIES] as Category[]).map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors',
                cat === c ? 'bg-miami text-white' : 'bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* Readiness legend + filter */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 text-miami-text/70">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-3 rounded-sm bg-green-tier" /> Ready (≥90%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-3 rounded-sm bg-yellow-tier" /> Caution (75–89%)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-2.5 h-3 rounded-sm bg-red-tier" /> Mobility first (&lt;75%)
          </span>
        </div>
        <button
          onClick={() => setReadyOnly(v => !v)}
          className={cn(
            'text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors',
            readyOnly
              ? 'bg-green-tier text-white'
              : 'bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30',
          )}
        >
          {readyOnly ? '✓ Ready only' : 'Ready only'}
        </button>
      </div>

      <p className="text-xs text-miami-text/60">
        {filtered.length} of {items.length} exercises shown
        {!assessment && (
          <span className="ml-2 text-yellow-tier">· Complete your assessment to unlock readiness colors</span>
        )}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map(({ it, pct }) => {
          const stretch = it.stretch_emphasis ? STRETCH_LABEL[it.stretch_emphasis] : null
          const isRed = pct != null && pct < 75
          const isExpanded = expandedId === it.id
          const sub = isRed ? findSubstitution(it) : null
          const limiting = it.limiting_joint
          const jointLabel = limiting ? (JOINT_LABEL[limiting] ?? limiting) : null
          return (
            <div
              key={it.id}
              className={cn(
                'rounded-xl bg-miami-ink/70 border border-miami-violet/20 p-3 transition-shadow',
                readinessBorder(pct),
                isRed && 'cursor-pointer hover:shadow-[0_0_18px_-6px_rgba(255,45,120,0.5)]',
              )}
              onClick={() => { if (isRed) setExpandedId(isExpanded ? null : it.id) }}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm font-medium text-miami-text leading-tight">{it.name}</p>
                {pct != null ? (
                  <span
                    className={cn(
                      'text-[10px] uppercase tracking-wide font-bold px-1.5 py-0.5 rounded shrink-0',
                      readinessBgClass(pct),
                    )}
                    title={readinessLabel(pct) ?? undefined}
                  >
                    {pct}%
                  </span>
                ) : it.tier && (
                  <span className="text-[10px] uppercase tracking-wide font-bold text-miami bg-miami/15 px-1.5 py-0.5 rounded shrink-0">
                    {it.tier[0]}
                  </span>
                )}
              </div>

              {/* Muscle + stretch-emphasis badges (the hypertrophy layer) */}
              <div className="flex flex-wrap items-center gap-1 mt-1.5">
                {it.primary_muscle && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-miami-violet/15 text-miami-text/80">
                    {it.primary_muscle}
                  </span>
                )}
                {stretch && (
                  <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded', stretch.cls)}>
                    {stretch.label}
                  </span>
                )}
              </div>

              <p className="text-[11px] text-miami-text/60 mt-1">
                {it.category}{it.subcategory ? ` · ${it.subcategory}` : ''}
                {pct != null && (
                  <span className={cn('ml-1.5 font-semibold', readinessTextClass(pct))}>
                    · {readinessLabel(pct)}
                  </span>
                )}
              </p>

              {/* ROM differentiator — only when readiness is red */}
              {isRed && (
                <div className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-red-tier">
                  <AlertTriangle size={12} />
                  Reduced stretch stimulus
                  <ChevronRight size={12} className={cn('ml-auto transition-transform', isExpanded && 'rotate-90')} />
                </div>
              )}

              {isRed && isExpanded && (
                <div className="mt-2 pt-2 border-t border-red-tier/20 space-y-2 text-[11px]" onClick={e => e.stopPropagation()}>
                  <p className="text-miami-text/80 leading-snug">
                    Your{jointLabel ? ` ${jointLabel}` : ' mobility'} limits the bottom of <span className="font-semibold text-miami-text">{it.name}</span>
                    {it.stretch_emphasis === 'high' && <> — and this is a <span className="text-miami font-semibold">high-stretch</span> movement, so you lose the most growth-driving part of the rep.</>}
                    {it.stretch_emphasis !== 'high' && <>, cutting the lengthened-position stimulus.</>}
                  </p>
                  {it.rom_note && (
                    <p className="flex items-start gap-1 text-miami-violet">
                      <Activity size={12} className="mt-0.5 shrink-0" />
                      <span><span className="font-semibold">Mobility Rx:</span> {it.rom_note}</span>
                    </p>
                  )}
                  {sub ? (
                    <p className="flex items-start gap-1 text-green-tier">
                      <ArrowRightLeft size={12} className="mt-0.5 shrink-0" />
                      <span><span className="font-semibold">Swap to:</span> {sub.name} — same {it.primary_muscle} target, hits it without the {jointLabel ?? 'mobility'} demand.</span>
                    </p>
                  ) : (
                    <p className="flex items-start gap-1 text-miami-text/60">
                      <ArrowRightLeft size={12} className="mt-0.5 shrink-0" />
                      <span>Reduce range to a pain-free depth and load the partial — or work the mobility Rx first.</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-miami-text/60 text-center py-8">No exercises match your filters.</p>
      )}
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Volume panel — weekly sets/muscle vs MEV/MAV/MRV landmarks
//  This is the #1 unmet need in hypertrophy apps (per research): per-muscle
//  weekly volume tracked against scientific landmarks.
// ────────────────────────────────────────────────────────────────────────────

interface VolumeLandmark {
  muscle: string
  mv: number
  mev: number
  mav_low: number
  mav_high: number
  mrv: number
}

type VolumeZone = 'under' | 'maintenance' | 'productive' | 'high' | 'overreaching'

function classifyVolume(sets: number, lm: VolumeLandmark): { zone: VolumeZone; label: string; cls: string } {
  if (sets < lm.mev)        return { zone: 'under',        label: 'Below growth',  cls: 'text-miami-text/50' }
  if (sets < lm.mav_low)    return { zone: 'maintenance',  label: 'Maintenance',   cls: 'text-yellow-tier' }
  if (sets <= lm.mav_high)  return { zone: 'productive',   label: 'Productive',    cls: 'text-green-tier' }
  if (sets <= lm.mrv)       return { zone: 'high',         label: 'High',          cls: 'text-miami' }
  return { zone: 'overreaching', label: 'Over MRV', cls: 'text-red-tier' }
}

function zoneBarColor(zone: VolumeZone): string {
  switch (zone) {
    case 'under':        return 'bg-miami-text/30'
    case 'maintenance':  return 'bg-yellow-tier'
    case 'productive':   return 'bg-green-tier'
    case 'high':         return 'bg-miami'
    case 'overreaching': return 'bg-red-tier'
  }
}

type VolumeMode = 'logged' | 'planned'

function VolumePanel() {
  const [landmarks, setLandmarks] = useState<VolumeLandmark[]>([])
  const [volume, setVolume] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [days, setDays] = useState(7)
  const [mode, setMode] = useState<VolumeMode>('logged')

  return (
    <div className="space-y-4">
      <MesocycleCard />
      <VolumeBoard
        landmarks={landmarks} setLandmarks={setLandmarks}
        volume={volume} setVolume={setVolume}
        loading={loading} setLoading={setLoading}
        days={days} setDays={setDays}
        mode={mode} setMode={setMode}
      />
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Mesocycle builder (light v1) — progressive volume → deload, autoregulated
// ────────────────────────────────────────────────────────────────────────────

interface Mesocycle {
  id: string
  name: string
  weeks: number
  current_week: number
  status: string
  created_at: string
}

// Weekly target as % of your MAV range — ramp volume, then deload on the final week.
function weekPlan(week: number, weeks: number): { rir: string; volume: string; note: string; deload: boolean } {
  const isDeload = week === weeks
  if (isDeload) return { rir: '4–5', volume: '~50%', note: 'Deload — halve sets, keep the bar moving', deload: true }
  const progress = (week - 1) / Math.max(1, weeks - 1) // 0 .. 1 across accumulation
  if (progress < 0.34) return { rir: '3–4', volume: 'MEV → low MAV', note: 'Accumulation — add 1–2 sets/muscle from last week', deload: false }
  if (progress < 0.67) return { rir: '2–3', volume: 'mid MAV', note: 'Build — push sets toward your MAV ceiling', deload: false }
  return { rir: '1–2', volume: 'high MAV → MRV', note: 'Overreach — near MRV, RIR 1–2, then deload next', deload: false }
}

function MesocycleCard() {
  const [meso, setMeso] = useState<Mesocycle | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [weeks, setWeeks] = useState(5)

  useEffect(() => {
    let active = true
    ;(async () => {
      const { data } = await supabase
        .from('mesocycles')
        .select('id, name, weeks, current_week, status, created_at')
        .eq('status', 'active')
        .order('created_at', { ascending: false })
        .limit(1)
      if (!active) return
      setMeso((data?.[0] as Mesocycle) ?? null)
      setLoading(false)
    })()
    return () => { active = false }
  }, [])

  async function start() {
    setBusy(true)
    const { data: u } = await supabase.auth.getUser()
    const { data, error } = await supabase
      .from('mesocycles')
      .insert({
        user_id: u.user?.id,
        name: `${weeks}-Week Hypertrophy Block`,
        sport: 'bodybuilding',
        weeks,
        current_week: 1,
        status: 'active',
      })
      .select('id, name, weeks, current_week, status, created_at')
      .single()
    setBusy(false)
    if (!error && data) setMeso(data as Mesocycle)
  }

  async function advance(dir: 1 | -1) {
    if (!meso) return
    const next = Math.min(meso.weeks, Math.max(1, meso.current_week + dir))
    setMeso({ ...meso, current_week: next })
    await supabase.from('mesocycles').update({ current_week: next }).eq('id', meso.id)
  }

  async function complete() {
    if (!meso) return
    setBusy(true)
    await supabase.from('mesocycles').update({ status: 'complete' }).eq('id', meso.id)
    setMeso(null)
    setBusy(false)
  }

  if (loading) return null

  if (!meso) {
    return (
      <SectionCard title={<span className="flex items-center gap-2"><Activity size={15} className="text-miami" /> Mesocycle</span>}>
        <p className="text-xs text-miami-text/70 mb-3">
          Run a progressive block: ramp volume from MEV toward MRV week over week, drop RIR as you go, then deload. Your Volume board tracks you against the plan.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-miami-text/60">Length:</span>
          {[4, 5, 6].map(w => (
            <button
              key={w}
              onClick={() => setWeeks(w)}
              className={cn(
                'text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors',
                weeks === w ? 'bg-miami text-white' : 'bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30',
              )}
            >
              {w} wk
            </button>
          ))}
          <button
            onClick={start}
            disabled={busy}
            className="ml-auto text-xs font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-miami to-miami-violet text-white disabled:opacity-50"
          >
            {busy ? 'Starting…' : 'Start block'}
          </button>
        </div>
      </SectionCard>
    )
  }

  const plan = weekPlan(meso.current_week, meso.weeks)
  return (
    <SectionCard
      title={
        <span className="flex items-center gap-2">
          <Activity size={15} className="text-miami" /> {meso.name}
          <span className="text-xs font-normal text-miami-text/60">· Week {meso.current_week} of {meso.weeks}</span>
        </span>
      }
    >
      {/* Week dots */}
      <div className="flex items-center gap-1.5 mb-3">
        {Array.from({ length: meso.weeks }).map((_, i) => {
          const wk = i + 1
          const isDeload = wk === meso.weeks
          return (
            <div
              key={wk}
              className={cn(
                'flex-1 h-2 rounded-full',
                wk < meso.current_week ? 'bg-green-tier'
                : wk === meso.current_week ? (isDeload ? 'bg-yellow-tier' : 'bg-miami')
                : isDeload ? 'bg-yellow-tier/25' : 'bg-miami-violet/20',
              )}
              title={isDeload ? `Week ${wk} · Deload` : `Week ${wk}`}
            />
          )
        })}
      </div>

      <div className={cn(
        'rounded-lg px-3 py-2 mb-3 border',
        plan.deload ? 'bg-yellow-tier-bg border-yellow-tier/30' : 'bg-miami-violet/10 border-miami-violet/20',
      )}>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          <span className="text-miami-text/60">Target RIR <span className="font-bold text-miami-text">{plan.rir}</span></span>
          <span className="text-miami-text/60">Volume <span className="font-bold text-miami-text">{plan.volume}</span></span>
        </div>
        <p className={cn('text-xs mt-1 font-medium', plan.deload ? 'text-yellow-tier' : 'text-miami-text/80')}>{plan.note}</p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => advance(-1)}
          disabled={meso.current_week <= 1}
          className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30 disabled:opacity-40"
        >
          ← Prev week
        </button>
        {meso.current_week < meso.weeks ? (
          <button
            onClick={() => advance(1)}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-miami text-white hover:bg-miami-dark"
          >
            Next week →
          </button>
        ) : (
          <button
            onClick={complete}
            disabled={busy}
            className="text-xs font-bold px-3 py-1.5 rounded-lg bg-green-tier-bg text-green-tier border border-green-tier/40 hover:bg-green-tier/20 disabled:opacity-50"
          >
            {busy ? 'Finishing…' : 'Complete block'}
          </button>
        )}
        <button
          onClick={complete}
          className="ml-auto text-xs text-miami-text/40 hover:text-red-tier"
        >
          End early
        </button>
      </div>
    </SectionCard>
  )
}

function VolumeBoard({
  landmarks, setLandmarks, volume, setVolume, loading, setLoading, days, setDays, mode, setMode,
}: {
  landmarks: VolumeLandmark[]; setLandmarks: (v: VolumeLandmark[]) => void
  volume: Record<string, number>; setVolume: (v: Record<string, number>) => void
  loading: boolean; setLoading: (v: boolean) => void
  days: number; setDays: (v: number) => void
  mode: VolumeMode; setMode: (v: VolumeMode) => void
}) {

  useEffect(() => {
    let active = true
    setLoading(true)
    ;(async () => {
      const [{ data: lm }, volRes] = await Promise.all([
        supabase.from('muscle_volume_landmarks').select('muscle, mv, mev, mav_low, mav_high, mrv'),
        mode === 'planned'
          ? supabase.rpc('program_planned_volume', { p_program: null })
          : supabase.rpc('weekly_muscle_volume', { p_days: days }),
      ])
      if (!active) return
      setLandmarks((lm as VolumeLandmark[]) ?? [])
      const map: Record<string, number> = {}
      const setsKey = mode === 'planned' ? 'planned_sets' : 'working_sets'
      for (const row of (volRes.data as Record<string, unknown>[]) ?? []) {
        map[row.muscle as string] = Number(row[setsKey])
      }
      setVolume(map)
      setLoading(false)
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, mode])

  const rows = useMemo(() => {
    return [...landmarks]
      .map(lm => ({ lm, sets: volume[lm.muscle] ?? 0 }))
      .sort((a, b) => b.sets - a.sets || a.lm.muscle.localeCompare(b.lm.muscle))
  }, [landmarks, volume])

  const totalSets = useMemo(() => Object.values(volume).reduce((s, v) => s + v, 0), [volume])

  if (loading) return <Spinner />

  return (
    <div className="space-y-4">
      {/* Logged vs Planned toggle */}
      <div className="flex items-center gap-1 p-0.5 rounded-lg bg-miami-violet/10 w-fit">
        {(['logged', 'planned'] as VolumeMode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={cn(
              'text-xs font-semibold px-3 py-1.5 rounded-md transition-colors capitalize',
              mode === m ? 'bg-miami text-white' : 'text-miami-text/70 hover:text-miami',
            )}
          >
            {m === 'logged' ? 'Logged' : 'Planned (program)'}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-miami-text/70">
          <span className="font-bold text-miami-text">{totalSets}</span>{' '}
          {mode === 'planned' ? 'planned sets/week in your program' : `working sets in the last ${days} days`}
        </p>
        {mode === 'logged' && (
          <div className="flex items-center gap-1">
            {[7, 14].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={cn(
                  'text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors',
                  days === d ? 'bg-miami text-white' : 'bg-miami-violet/15 text-miami-text/80 hover:bg-miami-violet/30',
                )}
              >
                {d}d
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 text-[11px] text-miami-text/70">
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-3 rounded-sm bg-yellow-tier" /> Maintenance (MEV→MAV)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-3 rounded-sm bg-green-tier" /> Productive (MAV)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-3 rounded-sm bg-miami" /> High (→MRV)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-2.5 h-3 rounded-sm bg-red-tier" /> Over MRV</span>
      </div>

      {totalSets === 0 && mode === 'logged' && (
        <div className="rounded-lg bg-miami-violet/10 border border-miami-violet/20 px-3 py-2 text-xs text-miami-text/70">
          No working sets logged yet in this window. Log a workout and your weekly volume per muscle will populate here vs scientific MEV/MAV/MRV landmarks.
        </div>
      )}
      {totalSets === 0 && mode === 'planned' && (
        <div className="rounded-lg bg-miami-violet/10 border border-miami-violet/20 px-3 py-2 text-xs text-miami-text/70">
          No generated program yet. Head to the Generate tab to auto-build a ROM-tuned program — its planned weekly volume per muscle will show here vs your MEV/MAV/MRV landmarks.
        </div>
      )}

      <SectionCard>
        <div className="space-y-3">
          {rows.map(({ lm, sets }) => {
            const c = classifyVolume(sets, lm)
            // Scale the bar to MRV (with a little headroom).
            const scaleMax = Math.max(lm.mrv * 1.1, sets)
            const pct = scaleMax > 0 ? Math.min(100, (sets / scaleMax) * 100) : 0
            const mevPct = scaleMax > 0 ? (lm.mev / scaleMax) * 100 : 0
            const mavLowPct = scaleMax > 0 ? (lm.mav_low / scaleMax) * 100 : 0
            const mavHighPct = scaleMax > 0 ? (lm.mav_high / scaleMax) * 100 : 0
            const mrvPct = scaleMax > 0 ? (lm.mrv / scaleMax) * 100 : 0
            return (
              <div key={lm.muscle}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-miami-text">{lm.muscle}</span>
                  <span className="tabular-nums">
                    <span className="font-bold text-miami-text">{sets}</span>
                    <span className="text-miami-text/40"> / {lm.mav_low}–{lm.mav_high} sets</span>
                    <span className={cn('ml-2 font-semibold', c.cls)}>{c.label}</span>
                  </span>
                </div>
                <div className="relative h-3 rounded-full bg-miami-bg overflow-hidden">
                  {/* MAV productive band shading */}
                  <div
                    className="absolute inset-y-0 bg-green-tier/10"
                    style={{ left: `${mavLowPct}%`, width: `${Math.max(0, mavHighPct - mavLowPct)}%` }}
                  />
                  {/* Actual volume fill */}
                  <div className={cn('absolute inset-y-0 left-0 rounded-full', zoneBarColor(c.zone))} style={{ width: `${pct}%` }} />
                  {/* Landmark tick marks */}
                  {[mevPct, mavLowPct, mavHighPct, mrvPct].map((p, i) => (
                    <div key={i} className="absolute inset-y-0 w-px bg-miami-text/30" style={{ left: `${p}%` }} />
                  ))}
                </div>
                <div className="flex justify-between text-[9px] text-miami-text/40 mt-0.5 tabular-nums">
                  <span>MEV {lm.mev}</span>
                  <span>MAV {lm.mav_low}–{lm.mav_high}</span>
                  <span>MRV {lm.mrv}</span>
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}
