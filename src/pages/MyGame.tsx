// MyGame on the BB site renders as "My Training" (sport_config.game_label).
// This is the BB-native workout & exercise browser. The legacy BJJ MyGame
// implementation lives in git history; this file replaces it for the
// romrxbodybuilding.com build.

import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
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

function tierBg(tier: string | null | undefined): string {
  switch ((tier ?? '').toLowerCase()) {
    case 'beginner':     return 'border-l-4 border-miami-teal'
    case 'intermediate': return 'border-l-4 border-miami'
    case 'advanced':     return 'border-l-4 border-miami-gold'
    default:             return 'border-l-4 border-gray-200'
  }
}

// ────────────────────────────────────────────────────────────────────────────
//  Main page
// ────────────────────────────────────────────────────────────────────────────

type TabKey = 'templates' | 'mine' | 'library'

export function MyGame() {
  const { user } = useAuth()
  const { profile, loading: profileLoading } = useProfile(user?.id)
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
      {tab === 'library' && <ExerciseLibraryPanel />}
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
          : 'border-transparent text-charcoal-light hover:text-miami',
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
                  tier === 'beginner' ? 'bg-miami-teal'
                  : tier === 'intermediate' ? 'bg-miami'
                  : 'bg-miami-gold')} />
                <span className="capitalize">{tier} hypertrophy</span>
                <span className="text-xs font-normal text-charcoal-light">
                  · {SPLIT_LABEL[list[0]?.split_type ?? ''] ?? '—'}
                </span>
                {locked && <span className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">Above your tier</span>}
              </span>
            }
          >
            <div className="divide-y divide-miami-light/50">
              {list.map(t => {
                const isOpen = expanded === t.id
                const ex = exercises[t.id]
                return (
                  <div key={t.id}>
                    <button
                      onClick={() => toggle(t.id)}
                      className={cn(
                        'w-full text-left py-3 pl-3 pr-2 flex items-center gap-3 hover:bg-miami-light/30 transition-colors rounded-lg',
                        tierBg(t.tier),
                      )}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-charcoal truncate">{t.day_label}</p>
                        {t.description && (
                          <p className="text-xs text-charcoal-light mt-0.5 truncate">{t.description}</p>
                        )}
                      </div>
                      <ChevronRight
                        size={16}
                        className={cn('text-charcoal-light transition-transform shrink-0', isOpen && 'rotate-90')}
                      />
                    </button>

                    {isOpen && (
                      <div className="bg-miami-light/20 px-3 py-3 space-y-2">
                        {!ex && <Spinner />}
                        {ex && ex.length === 0 && (
                          <p className="text-xs text-charcoal-light italic">No exercises in this template.</p>
                        )}
                        {ex && ex.length > 0 && (
                          <ol className="space-y-1.5 text-sm">
                            {ex.map(e => (
                              <li key={e.id} className="flex items-start gap-2">
                                <span className="text-miami font-bold w-5 shrink-0">{e.position}.</span>
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium text-charcoal">{e.exercise_name}</p>
                                  <p className="text-xs text-charcoal-light">
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
                                ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
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
            'rounded-2xl border border-miami-light bg-white p-4 hover:shadow-md transition-shadow',
            tierBg(w.tier),
          )}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <p className="font-semibold text-charcoal text-sm">{w.name}</p>
            <span className="text-[10px] uppercase tracking-wide font-bold text-miami bg-miami-light px-2 py-0.5 rounded-full shrink-0">
              {w.tier}
            </span>
          </div>
          {w.day_label && <p className="text-xs text-charcoal-light">{w.day_label}</p>}
          {w.description && <p className="text-xs text-charcoal-light mt-1 line-clamp-2">{w.description}</p>}
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

function ExerciseLibraryPanel() {
  const [items, setItems] = useState<UnlockedTechnique[]>([])
  const [loading, setLoading] = useState(true)
  const [cat, setCat] = useState<Category>('All')
  const [q, setQ] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    // unlocked_techniques_v is already filtered server-side by the user's
    // active_sport + active_bb_tier (see fix in PR #1).
    supabase
      .from('unlocked_techniques_v')
      .select('id, code, name, category, subcategory, sport, tier')
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

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return items.filter(it => {
      if (cat !== 'All' && it.category !== cat) return false
      if (needle && !it.name.toLowerCase().includes(needle)) return false
      return true
    })
  }, [items, cat, q])

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
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search exercises…"
            className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-miami-light focus:outline-none focus:border-miami transition-colors bg-white"
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter size={12} className="text-charcoal-light mr-1" />
          {(['All', ...BB_CATEGORIES] as Category[]).map(c => (
            <button
              key={c}
              onClick={() => setCat(c)}
              className={cn(
                'text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors',
                cat === c ? 'bg-miami text-white' : 'bg-miami-light/40 text-miami-dark hover:bg-miami-light',
              )}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-charcoal-light">
        {filtered.length} of {items.length} exercises shown
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {filtered.map(it => (
          <div
            key={it.id}
            className={cn(
              'rounded-xl bg-white border border-miami-light p-3',
              tierBg(it.tier),
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-charcoal leading-tight">{it.name}</p>
              {it.tier && (
                <span className="text-[10px] uppercase tracking-wide font-bold text-miami-dark bg-miami-light px-1.5 py-0.5 rounded shrink-0">
                  {it.tier[0]}
                </span>
              )}
            </div>
            <p className="text-[11px] text-charcoal-light mt-0.5">
              {it.category}{it.subcategory ? ` · ${it.subcategory}` : ''}
            </p>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-charcoal-light text-center py-8">No exercises match your filters.</p>
      )}
    </div>
  )
}
