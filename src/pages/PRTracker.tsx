import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Spinner } from '../components/Spinner'
import { Trophy, TrendingUp, AlertTriangle } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts'

interface PRRecord {
  id: string
  exercise_name: string
  pr_type: string
  weight_kg: number
  reps: number
  estimated_1rm_kg: number
  achieved_at: string
}

interface HistoryPoint {
  performed_at: string
  weight_kg: number
  reps: number
  estimated_1rm_kg: number
}

interface VolumeRow {
  week_start: string
  muscle_group: string | null
  total_sets: number
  total_reps: number
  total_volume_kg: number
}

export function PRTracker() {
  const { user } = useAuth()
  const [unit, setUnit] = useState<'kg' | 'lb'>('lb')
  const [loading, setLoading] = useState(true)
  const [prs, setPrs] = useState<PRRecord[]>([])
  const [volume, setVolume] = useState<VolumeRow[]>([])
  const [selectedExercise, setSelectedExercise] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryPoint[]>([])

  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      const [{ data: prData }, { data: volData }] = await Promise.all([
        supabase
          .from('pr_records')
          .select('*')
          .order('estimated_1rm_kg', { ascending: false }),
        supabase.rpc('get_weekly_volume', { p_weeks: 8 }),
      ])
      if (!alive) return
      setPrs((prData ?? []) as PRRecord[])
      setVolume((volData ?? []) as VolumeRow[])
      if (prData && prData.length > 0) {
        setSelectedExercise(prData[0].exercise_name)
      }
      setLoading(false)
    })()
    return () => { alive = false }
  }, [user])

  useEffect(() => {
    if (!selectedExercise) return
    let alive = true
    ;(async () => {
      const { data } = await supabase.rpc('get_exercise_history', {
        p_exercise_name: selectedExercise,
        p_limit: 60,
      })
      if (!alive) return
      setHistory(((data ?? []) as HistoryPoint[]).reverse())
    })()
    return () => { alive = false }
  }, [selectedExercise])

  const convertWeight = (kg: number) => unit === 'lb' ? Math.round(kg / 0.453592) : Math.round(kg)

  // Aggregate weekly volume by week (sum across muscle groups)
  const weeklyTotal = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of volume) {
      const wk = r.week_start.slice(0, 10)
      map.set(wk, (map.get(wk) ?? 0) + Number(r.total_volume_kg))
    }
    return Array.from(map.entries())
      .map(([week, vol]) => ({ week, volume: convertWeight(vol), label: week.slice(5) }))
      .sort((a, b) => a.week.localeCompare(b.week))
  }, [volume, unit])

  // Aggregate this week's volume by muscle group
  const muscleVolume = useMemo(() => {
    if (volume.length === 0) return []
    const latestWeek = volume.reduce((max, r) => r.week_start > max ? r.week_start : max, volume[0].week_start)
    const map = new Map<string, { sets: number; vol: number }>()
    for (const r of volume) {
      if (r.week_start !== latestWeek) continue
      const k = r.muscle_group ?? 'other'
      const cur = map.get(k) ?? { sets: 0, vol: 0 }
      map.set(k, { sets: cur.sets + Number(r.total_sets), vol: cur.vol + Number(r.total_volume_kg) })
    }
    return Array.from(map.entries())
      .map(([muscle, v]) => ({ muscle, sets: v.sets, volume: convertWeight(v.vol) }))
      .sort((a, b) => b.sets - a.sets)
  }, [volume, unit])

  // Deload signal: latest week volume vs prior 3-week average
  const deloadSignal = useMemo(() => {
    if (weeklyTotal.length < 2) return null
    const latest = weeklyTotal[weeklyTotal.length - 1].volume
    const prior = weeklyTotal.slice(-4, -1)
    if (prior.length === 0) return null
    const avg = prior.reduce((a, b) => a + b.volume, 0) / prior.length
    if (avg === 0) return null
    const pctJump = ((latest - avg) / avg) * 100
    if (pctJump > 20) return { kind: 'deload', pct: Math.round(pctJump) }
    if (pctJump < -25) return { kind: 'recovery', pct: Math.round(pctJump) }
    return null
  }, [weeklyTotal])

  if (loading) return <Spinner />

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader
        title="PRs & Progress"
        subtitle="Lifetime personal records, e1RM curves, and weekly volume"
        action={
          <button
            onClick={() => setUnit(u => u === 'kg' ? 'lb' : 'kg')}
            className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-miami-violet/15 text-miami-violet border border-miami-violet/30 hover:bg-miami-violet/25"
          >
            {unit.toUpperCase()}
          </button>
        }
      />

      {deloadSignal && (
        <SectionCard className="border-yellow-tier/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-yellow-tier flex-shrink-0 mt-0.5" size={20} />
            <div>
              <div className="font-bold text-miami-text">
                {deloadSignal.kind === 'deload'
                  ? `Volume jumped +${deloadSignal.pct}% this week`
                  : `Volume dropped ${deloadSignal.pct}% this week`}
              </div>
              <div className="text-sm text-miami-text/70 mt-1">
                {deloadSignal.kind === 'deload'
                  ? 'Consider a deload next week — large jumps in weekly volume can outpace recovery. Drop intensity ~10% or sets ~30%.'
                  : 'Looks like a deload or off week. Plan a return-to-volume next session at ~80% of your peak.'}
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Lifetime PRs grid */}
      <SectionCard title="Lifetime PRs" subtitle={prs.length > 0 ? `${prs.length} exercises tracked` : 'Log a workout to build your PR board'}>
        {prs.length === 0 ? (
          <div className="text-center py-8 text-miami-text/60">
            <Trophy className="mx-auto mb-2 text-miami-violet/40" size={32} />
            No PRs logged yet. Hit the Log button to start tracking.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {prs.slice(0, 12).map(pr => (
              <button
                key={pr.id}
                onClick={() => setSelectedExercise(pr.exercise_name)}
                className={
                  'text-left p-3 rounded-xl bg-miami-bg border transition-all ' +
                  (selectedExercise === pr.exercise_name
                    ? 'border-miami-gold shadow-[0_0_16px_-4px_rgba(255,215,0,0.4)]'
                    : 'border-miami-violet/20 hover:border-miami-violet/50')
                }
              >
                <div className="flex items-start justify-between mb-1">
                  <div className="text-sm font-medium text-miami-text line-clamp-1">{pr.exercise_name}</div>
                  <Trophy size={12} className="text-miami-gold flex-shrink-0 mt-0.5" />
                </div>
                <div className="text-xs text-miami-text/60 mb-2">
                  {convertWeight(pr.weight_kg)} {unit} × {pr.reps}
                </div>
                <div className="text-[10px] uppercase tracking-wide text-miami-text/50">e1RM</div>
                <div className="font-display font-bold text-xl text-miami-text tabular-nums">
                  {convertWeight(pr.estimated_1rm_kg)} <span className="text-xs text-miami-text/60">{unit}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </SectionCard>

      {/* e1RM curve for selected exercise */}
      {selectedExercise && history.length > 0 && (
        <SectionCard
          title={`${selectedExercise} — e1RM Curve`}
          subtitle={`${history.length} sets logged`}
        >
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={history.map(h => ({
                date: h.performed_at.slice(5, 10),
                e1rm: convertWeight(h.estimated_1rm_kg),
                weight: convertWeight(h.weight_kg),
                reps: h.reps,
              }))}>
                <XAxis dataKey="date" stroke="#F0EDE8" tick={{ fontSize: 11, fill: '#F0EDE8' }} />
                <YAxis stroke="#F0EDE8" tick={{ fontSize: 11, fill: '#F0EDE8' }} unit={unit} />
                <Tooltip
                  contentStyle={{ background: '#0A0A18', border: '1px solid rgba(180,79,232,0.4)', borderRadius: 8 }}
                  labelStyle={{ color: '#F0EDE8' }}
                />
                <Line type="monotone" dataKey="e1rm" stroke="#FFD700" strokeWidth={2} dot={{ fill: '#FF2D78', r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Weekly volume chart */}
      <SectionCard title="Weekly Volume" subtitle="Last 8 weeks (working sets only)">
        {weeklyTotal.length === 0 ? (
          <div className="text-center py-8 text-miami-text/60">
            <TrendingUp className="mx-auto mb-2 text-miami-violet/40" size={32} />
            No volume data yet
          </div>
        ) : (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weeklyTotal}>
                <XAxis dataKey="label" stroke="#F0EDE8" tick={{ fontSize: 11, fill: '#F0EDE8' }} />
                <YAxis stroke="#F0EDE8" tick={{ fontSize: 11, fill: '#F0EDE8' }} unit={unit} />
                <Tooltip
                  contentStyle={{ background: '#0A0A18', border: '1px solid rgba(180,79,232,0.4)', borderRadius: 8 }}
                  labelStyle={{ color: '#F0EDE8' }}
                />
                <Bar dataKey="volume" fill="#B44FE8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* Muscle group volume */}
      {muscleVolume.length > 0 && (
        <SectionCard title="This Week by Muscle Group" subtitle="Working sets logged">
          <div className="space-y-2">
            {muscleVolume.map(m => {
              const maxSets = Math.max(...muscleVolume.map(x => x.sets))
              const pct = (m.sets / maxSets) * 100
              return (
                <div key={m.muscle}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-miami-text capitalize">{m.muscle.replace(/_/g, ' ')}</span>
                    <span className="text-miami-text/60 tabular-nums">{m.sets} sets · {m.volume.toLocaleString()} {unit}</span>
                  </div>
                  <div className="h-2 bg-miami-bg rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-miami-violet to-miami" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
        </SectionCard>
      )}
    </div>
  )
}
