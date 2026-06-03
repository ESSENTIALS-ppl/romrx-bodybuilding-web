import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Spinner } from '../components/Spinner'
import { Plus, Check, Trash2, Timer, Calculator, ChevronRight, TrendingUp } from 'lucide-react'
import { cn } from '../lib/utils'

// ────────────────────────────────────────────────────────────────────────────
//  Types
// ────────────────────────────────────────────────────────────────────────────

interface Exercise {
  id: string
  name: string
  code: string
  subcategory: string | null
}

interface LoggedSet {
  id?: string
  set_index: number
  weight_kg: number | null
  reps: number | null
  rpe: number | null
  is_warmup: boolean
  saved: boolean
  pr?: boolean
  e1rm?: number | null
}

interface ExerciseBlock {
  exercise: Exercise
  sets: LoggedSet[]
  history?: { weight_kg: number; reps: number; estimated_1rm_kg: number; performed_at: string }[]
}

// ────────────────────────────────────────────────────────────────────────────
//  Plate calculator (per side)
// ────────────────────────────────────────────────────────────────────────────

const KG_PLATES = [25, 20, 15, 10, 5, 2.5, 1.25, 0.5]
const LB_PLATES = [45, 35, 25, 10, 5, 2.5]

function platesForSide(targetKg: number, unit: 'kg' | 'lb'): { plate: number; count: number }[] {
  if (!targetKg || targetKg <= 0) return []
  const barKg = unit === 'kg' ? 20 : 20.4 // 45lb bar
  const perSideKg = (targetKg - barKg) / 2
  if (perSideKg <= 0) return []

  const plates = unit === 'kg' ? KG_PLATES : LB_PLATES.map(p => p * 0.453592)
  const labels = unit === 'kg' ? KG_PLATES : LB_PLATES

  let remaining = perSideKg
  const out: { plate: number; count: number }[] = []
  for (let i = 0; i < plates.length; i++) {
    let count = 0
    while (remaining >= plates[i] - 0.01) {
      remaining -= plates[i]
      count++
    }
    if (count > 0) out.push({ plate: labels[i], count })
  }
  return out
}

// ────────────────────────────────────────────────────────────────────────────
//  Rest Timer
// ────────────────────────────────────────────────────────────────────────────

function RestTimer({ seconds, onDone }: { seconds: number; onDone: () => void }) {
  const [remaining, setRemaining] = useState(seconds)
  useEffect(() => {
    if (remaining <= 0) { onDone(); return }
    const t = setTimeout(() => setRemaining(r => r - 1), 1000)
    return () => clearTimeout(t)
  }, [remaining, onDone])

  const mm = Math.floor(remaining / 60)
  const ss = (remaining % 60).toString().padStart(2, '0')
  const pct = Math.max(0, (remaining / seconds) * 100)

  return (
    <div className="fixed bottom-20 right-4 z-40 bg-miami-ink/95 backdrop-blur border border-miami-violet/40 rounded-2xl p-4 shadow-[0_0_32px_-8px_rgba(180,79,232,0.6)] min-w-[180px]">
      <div className="flex items-center gap-2 text-miami-text/70 text-xs uppercase tracking-wide mb-1">
        <Timer size={14} /> Rest
      </div>
      <div className="font-display font-bold text-3xl text-miami-text tabular-nums">{mm}:{ss}</div>
      <div className="h-1.5 bg-miami-bg rounded-full mt-2 overflow-hidden">
        <div className="h-full bg-gradient-to-r from-miami to-miami-violet transition-all duration-1000" style={{ width: `${pct}%` }} />
      </div>
      <button onClick={onDone} className="text-xs text-miami-violet hover:text-miami mt-2">Skip</button>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────────────────
//  Main page
// ────────────────────────────────────────────────────────────────────────────

export function WorkoutLogger() {
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [workoutId] = useState<string>(params.get('w') ?? `manual-${Date.now()}`)
  const [workoutName] = useState<string>(params.get('name') ?? 'Workout')
  const [exercises, setExercises] = useState<Exercise[]>([])
  const [blocks, setBlocks] = useState<ExerciseBlock[]>([])
  const [showExercisePicker, setShowExercisePicker] = useState(false)
  const [unit, setUnit] = useState<'kg' | 'lb'>('lb')
  const [restRunning, setRestRunning] = useState(false)
  const [restSeconds, setRestSeconds] = useState(180)
  const [showCalc, setShowCalc] = useState<number | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')

  // Load all BB techniques as exercise picker source
  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data } = await supabase
        .from('techniques')
        .select('id, name, code, subcategory, sport')
        .eq('sport', 'bodybuilding')
        .order('subcategory', { ascending: true, nullsFirst: false })
        .order('name')
      if (!alive) return
      setExercises((data ?? []) as Exercise[])
      setLoading(false)
    })()
    return () => { alive = false }
  }, [])

  const addExercise = async (ex: Exercise) => {
    // Load last 5 sessions for this exercise
    const { data: history } = await supabase.rpc('get_exercise_history', {
      p_exercise_name: ex.name,
      p_limit: 30,
    })
    setBlocks(b => [
      ...b,
      {
        exercise: ex,
        sets: [{ set_index: 1, weight_kg: null, reps: null, rpe: null, is_warmup: false, saved: false }],
        history: (history ?? []) as ExerciseBlock['history'],
      },
    ])
    setShowExercisePicker(false)
    setPickerSearch('')
  }

  const addSet = (bi: number) => {
    setBlocks(prev => {
      const next = [...prev]
      const last = next[bi].sets[next[bi].sets.length - 1]
      next[bi] = {
        ...next[bi],
        sets: [
          ...next[bi].sets,
          {
            set_index: next[bi].sets.length + 1,
            weight_kg: last?.weight_kg ?? null,
            reps: last?.reps ?? null,
            rpe: null,
            is_warmup: false,
            saved: false,
          },
        ],
      }
      return next
    })
  }

  const updateSet = (bi: number, si: number, patch: Partial<LoggedSet>) => {
    setBlocks(prev => {
      const next = [...prev]
      next[bi] = { ...next[bi], sets: next[bi].sets.map((s, i) => (i === si ? { ...s, ...patch } : s)) }
      return next
    })
  }

  const removeSet = (bi: number, si: number) => {
    setBlocks(prev => {
      const next = [...prev]
      next[bi] = { ...next[bi], sets: next[bi].sets.filter((_, i) => i !== si).map((s, i) => ({ ...s, set_index: i + 1 })) }
      return next
    })
  }

  const saveSet = async (bi: number, si: number) => {
    const block = blocks[bi]
    const set = block.sets[si]
    if (set.weight_kg == null || set.reps == null) return

    const weightKg = unit === 'lb' ? set.weight_kg * 0.453592 : set.weight_kg

    const { data, error } = await supabase.rpc('log_set', {
      p_workout_id: workoutId,
      p_exercise_id: block.exercise.id,
      p_exercise_name: block.exercise.name,
      p_set_index: set.set_index,
      p_weight_kg: weightKg,
      p_reps: set.reps,
      p_rpe: set.rpe,
      p_rir: null,
      p_is_warmup: set.is_warmup,
      p_notes: null,
      p_technique_id: block.exercise.id,
    })
    if (error) {
      console.error('log_set error', error)
      return
    }
    const result = data as { set_id: string; pr: boolean; estimated_1rm_kg: number }
    updateSet(bi, si, { saved: true, id: result.set_id, pr: result.pr, e1rm: result.estimated_1rm_kg })
    // Start rest timer if not warmup
    if (!set.is_warmup) {
      setRestRunning(true)
    }
  }

  const totalVolume = useMemo(() => {
    let v = 0
    for (const b of blocks) {
      for (const s of b.sets) {
        if (s.saved && s.weight_kg && s.reps && !s.is_warmup) {
          const wKg = unit === 'lb' ? s.weight_kg * 0.453592 : s.weight_kg
          v += wKg * s.reps
        }
      }
    }
    return v
  }, [blocks, unit])

  const totalSets = blocks.reduce((acc, b) => acc + b.sets.filter(s => s.saved && !s.is_warmup).length, 0)

  if (loading) return <Spinner />

  const filteredExercises = exercises.filter(e =>
    !pickerSearch || e.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
    (e.subcategory ?? '').toLowerCase().includes(pickerSearch.toLowerCase())
  )

  return (
    <div className="space-y-4 max-w-4xl">
      <PageHeader
        title={workoutName}
        subtitle={`${blocks.length} exercises · ${totalSets} working sets · ${Math.round(unit === 'lb' ? totalVolume / 0.453592 : totalVolume).toLocaleString()} ${unit} volume`}
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setUnit(u => u === 'kg' ? 'lb' : 'kg')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-miami-violet/15 text-miami-violet border border-miami-violet/30 hover:bg-miami-violet/25"
            >
              {unit.toUpperCase()}
            </button>
            <button
              onClick={() => navigate('/dashboard/my-game')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-green-tier-bg text-green-tier border border-green-tier/40 hover:bg-green-tier/20"
            >
              Finish
            </button>
          </div>
        }
      />

      {blocks.length === 0 && (
        <SectionCard>
          <div className="text-center py-12">
            <div className="text-miami-text/60 mb-4">No exercises logged yet</div>
            <button
              onClick={() => setShowExercisePicker(true)}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-miami to-miami-violet text-white font-bold shadow-[0_0_20px_-4px_rgba(255,45,120,0.6)]"
            >
              <Plus size={18} /> Add Exercise
            </button>
          </div>
        </SectionCard>
      )}

      {blocks.map((block, bi) => {
        const lastBest = block.history && block.history.length > 0
          ? Math.max(...block.history.map(h => h.estimated_1rm_kg))
          : null
        return (
          <SectionCard key={bi}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="font-bold text-miami-text">{block.exercise.name}</div>
                <div className="text-xs text-miami-text/60 mt-0.5">{block.exercise.subcategory ?? 'General'}</div>
              </div>
              {lastBest != null && (
                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-miami-text/50">Best e1RM</div>
                  <div className="text-sm font-bold text-miami-gold tabular-nums">
                    {Math.round(unit === 'lb' ? lastBest / 0.453592 : lastBest)} {unit}
                  </div>
                </div>
              )}
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wide text-miami-text/50">
                  <th className="text-left pb-2 w-8">#</th>
                  <th className="text-left pb-2">Weight ({unit})</th>
                  <th className="text-left pb-2">Reps</th>
                  <th className="text-left pb-2">RPE</th>
                  <th className="text-left pb-2 w-12"></th>
                  <th className="text-left pb-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {block.sets.map((s, si) => (
                  <tr key={si} className={cn('border-t border-miami-violet/10', s.saved && 'bg-green-tier-bg/30')}>
                    <td className="py-2">
                      <button
                        onClick={() => updateSet(bi, si, { is_warmup: !s.is_warmup })}
                        className={cn(
                          'w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center',
                          s.is_warmup ? 'bg-yellow-tier-bg text-yellow-tier' : 'bg-miami-violet/15 text-miami-violet'
                        )}
                        title={s.is_warmup ? 'Warmup' : 'Working set'}
                      >
                        {s.is_warmup ? 'W' : s.set_index}
                      </button>
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        value={s.weight_kg ?? ''}
                        onChange={e => updateSet(bi, si, { weight_kg: e.target.value === '' ? null : Number(e.target.value), saved: false })}
                        disabled={s.saved}
                        className="w-20 bg-miami-bg border border-miami-violet/20 rounded-md px-2 py-1 text-miami-text tabular-nums focus:border-miami-violet outline-none disabled:opacity-60"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        inputMode="numeric"
                        value={s.reps ?? ''}
                        onChange={e => updateSet(bi, si, { reps: e.target.value === '' ? null : Number(e.target.value), saved: false })}
                        disabled={s.saved}
                        className="w-16 bg-miami-bg border border-miami-violet/20 rounded-md px-2 py-1 text-miami-text tabular-nums focus:border-miami-violet outline-none disabled:opacity-60"
                      />
                    </td>
                    <td className="py-2">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.5"
                        min="1"
                        max="10"
                        value={s.rpe ?? ''}
                        onChange={e => updateSet(bi, si, { rpe: e.target.value === '' ? null : Number(e.target.value), saved: false })}
                        disabled={s.saved}
                        className="w-14 bg-miami-bg border border-miami-violet/20 rounded-md px-2 py-1 text-miami-text tabular-nums focus:border-miami-violet outline-none disabled:opacity-60"
                      />
                    </td>
                    <td className="py-2">
                      {s.saved ? (
                        <div className="flex items-center gap-1">
                          <Check size={14} className="text-green-tier" />
                          {s.pr && (
                            <span className="text-[10px] font-bold text-miami-gold uppercase tracking-wide">PR</span>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => saveSet(bi, si)}
                          disabled={s.weight_kg == null || s.reps == null}
                          className="px-2 py-1 rounded-md bg-gradient-to-r from-miami to-miami-violet text-white text-xs font-bold disabled:opacity-40"
                        >
                          Save
                        </button>
                      )}
                    </td>
                    <td className="py-2">
                      {!s.saved && (
                        <button onClick={() => removeSet(bi, si)} className="text-miami-text/40 hover:text-red-tier">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="flex gap-2 mt-3">
              <button
                onClick={() => addSet(bi)}
                className="text-xs px-3 py-1.5 rounded-lg bg-miami-violet/15 text-miami-violet hover:bg-miami-violet/25 inline-flex items-center gap-1"
              >
                <Plus size={12} /> Add set
              </button>
              <button
                onClick={() => setShowCalc(showCalc === bi ? null : bi)}
                className="text-xs px-3 py-1.5 rounded-lg bg-miami-violet/15 text-miami-violet hover:bg-miami-violet/25 inline-flex items-center gap-1"
              >
                <Calculator size={12} /> Plates
              </button>
            </div>

            {showCalc === bi && block.sets.length > 0 && (
              <div className="mt-3 p-3 rounded-lg bg-miami-bg border border-miami-violet/20">
                <div className="text-[10px] uppercase tracking-wide text-miami-text/50 mb-1">
                  Per side for {block.sets[block.sets.length - 1].weight_kg ?? 0} {unit}
                </div>
                {(() => {
                  const w = block.sets[block.sets.length - 1].weight_kg ?? 0
                  const wKg = unit === 'lb' ? w * 0.453592 : w
                  const plates = platesForSide(wKg, unit)
                  if (plates.length === 0) return <div className="text-xs text-miami-text/60">Bar only or invalid</div>
                  return (
                    <div className="flex flex-wrap gap-1.5">
                      {plates.map((p, i) => (
                        <span key={i} className="px-2 py-1 rounded bg-miami-violet/20 text-miami-text font-bold text-xs tabular-nums">
                          {p.count} × {p.plate}{unit}
                        </span>
                      ))}
                    </div>
                  )
                })()}
              </div>
            )}
          </SectionCard>
        )
      })}

      {blocks.length > 0 && (
        <button
          onClick={() => setShowExercisePicker(true)}
          className="w-full py-3 rounded-xl border-2 border-dashed border-miami-violet/30 text-miami-violet hover:border-miami-violet/60 hover:bg-miami-violet/5 transition-colors inline-flex items-center justify-center gap-2"
        >
          <Plus size={16} /> Add another exercise
        </button>
      )}

      {showExercisePicker && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-6" onClick={() => setShowExercisePicker(false)}>
          <div className="bg-miami-ink border border-miami-violet/30 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-miami-violet/20">
              <input
                autoFocus
                placeholder="Search exercises..."
                value={pickerSearch}
                onChange={e => setPickerSearch(e.target.value)}
                className="w-full bg-miami-bg border border-miami-violet/20 rounded-lg px-3 py-2 text-miami-text focus:border-miami-violet outline-none"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredExercises.slice(0, 60).map(ex => (
                <button
                  key={ex.id}
                  onClick={() => addExercise(ex)}
                  className="w-full text-left p-3 hover:bg-miami-violet/10 rounded-lg flex items-center justify-between"
                >
                  <div>
                    <div className="text-miami-text font-medium">{ex.name}</div>
                    <div className="text-xs text-miami-text/50">{ex.subcategory ?? 'General'}</div>
                  </div>
                  <ChevronRight size={16} className="text-miami-violet" />
                </button>
              ))}
              {filteredExercises.length === 0 && (
                <div className="text-center text-miami-text/50 py-8">No exercises match</div>
              )}
            </div>
          </div>
        </div>
      )}

      {restRunning && (
        <RestTimer seconds={restSeconds} onDone={() => setRestRunning(false)} />
      )}

      {/* Rest preset bar */}
      {blocks.length > 0 && (
        <div className="flex gap-2 items-center text-xs text-miami-text/60 pt-2">
          <span>Rest preset:</span>
          {[60, 90, 120, 180, 240].map(s => (
            <button
              key={s}
              onClick={() => { setRestSeconds(s); setRestRunning(true) }}
              className={cn(
                'px-2 py-1 rounded',
                restSeconds === s ? 'bg-miami-violet text-white' : 'bg-miami-violet/15 text-miami-violet hover:bg-miami-violet/25'
              )}
            >
              {s < 120 ? `${s}s` : `${s/60}m`}
            </button>
          ))}
          <span className="text-miami-text/40 ml-2 inline-flex items-center gap-1"><TrendingUp size={12} /> volume {totalSets > 0 ? `${Math.round(unit === 'lb' ? totalVolume / 0.453592 : totalVolume).toLocaleString()} ${unit}` : '—'}</span>
        </div>
      )}
    </div>
  )
}
