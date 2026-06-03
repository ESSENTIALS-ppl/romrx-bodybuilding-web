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
  Plus, Search, Filter, Sparkles,
} from 'lucide-react'

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
  cervical_rot_min: number | null
  thoracic_rot_min: number | null
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
  { pick: a => bestBilateral(a.cervical_rot_l, a.cervical_rot_r),     minKey: 'cervical_rot_min' },
  { pick: a => a.thoracic_rot,                                        minKey: 'thoracic_rot_min' },
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

type TabKey = 'templates' | 'mine' | 'library'

export function MyGame() {
  const { user } = useAuth()
  const { profile, assessment, loading: profileLoading } = useProfile(user?.id)
  const [tab, setTab] = useState<TabKey>('templates')

  if (profileLoading) return <Spinner />

  const userTier = profile?.active_bb_tier ?? null

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Training"
        subtitle="Hypertrophy programs built around your mobility"
        badge={bbTierLabel(userTier)}
        badgeColor={bbTierColor(userTier)}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-miami-light">
        <TabBtn active={tab === 'templates'} onClick={() => setTab('templates')} icon={Layers}>
          Templates
        </TabBtn>
        <TabBtn active={tab === 'mine'} onClick={() => setTab('mine')} icon={Dumbbell}>
          My Workouts
        </TabBtn>
        <TabBtn active={tab === 'library'} onClick={() => setTab('library')} icon={BookOpen}>
          Exercise Library
        </TabBtn>
      </div>

      {tab === 'templates' && <TemplatesPanel userTier={userTier} />}
      {tab === 'mine' && <MyWorkoutsPanel userId={user?.id} />}
      {tab === 'library' && <ExerciseLibraryPanel assessment={assessment} />}
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

  if (loading) return <Spinner />

  if (items.length === 0) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="No workouts yet"
        description="Add a template from the Templates tab to start your training plan."
        action={
          <button
            onClick={() => navigate('?')}
            className="btn-primary text-sm"
          >
            <Plus size={14} className="inline mr-1" /> Browse templates
          </button>
        }
      />
    )
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {items.map(w => (
        <div
          key={w.id}
          className={cn(
            'rounded-2xl border border-miami-violet/20 bg-miami-ink/70 p-4 hover:shadow-[0_0_20px_-6px_rgba(255,45,120,0.45)] transition-shadow',
            programTierBorder(w.tier),
          )}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-semibold text-miami-text text-sm">{w.name}</p>
            <span className="text-[10px] uppercase tracking-wide font-bold text-miami bg-miami/15 px-2 py-0.5 rounded-full shrink-0">
              {w.tier}
            </span>
          </div>
          {w.day_label && <p className="text-xs text-miami-text/60">{w.day_label}</p>}
          {w.description && <p className="text-xs text-miami-text/60 mt-1 line-clamp-2">{w.description}</p>}
        </div>
      ))}
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

  useEffect(() => {
    let active = true
    setLoading(true)
    // unlocked_techniques_v is already filtered server-side by the user's
    // active_sport + active_bb_tier (see fix in PR #1).
    // We also pull *_min columns so we can compute traffic-light readiness
    // client-side using the user's assessment.
    supabase
      .from('unlocked_techniques_v')
      .select('id, code, name, category, subcategory, sport, tier, hip_er_min, hip_ir_min, hip_abd_min, hip_flex_min, shoulder_er_min, shoulder_flex_min, ankle_df_min, lumbar_flex_min, lumbar_ext_min, cervical_rot_min, thoracic_rot_min')
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
        {filtered.map(({ it, pct }) => (
          <div
            key={it.id}
            className={cn(
              'rounded-xl bg-miami-ink/70 border border-miami-violet/20 p-3',
              readinessBorder(pct),
            )}
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
            <p className="text-[11px] text-miami-text/60 mt-0.5">
              {it.category}{it.subcategory ? ` · ${it.subcategory}` : ''}
              {pct != null && (
                <span className={cn('ml-1.5 font-semibold', readinessTextClass(pct))}>
                  · {readinessLabel(pct)}
                </span>
              )}
            </p>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-miami-text/60 text-center py-8">No exercises match your filters.</p>
      )}
    </div>
  )
}
