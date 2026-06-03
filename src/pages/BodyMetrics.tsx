import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Spinner } from '../components/Spinner'
import { Scale, TrendingDown, TrendingUp, Camera, Upload, Trash2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface MetricRow {
  id: string
  measured_at: string
  weight_kg: number | null
  body_fat_pct: number | null
  neck_cm: number | null
  chest_cm: number | null
  waist_cm: number | null
  hip_cm: number | null
  arm_l_cm: number | null
  arm_r_cm: number | null
  thigh_l_cm: number | null
  thigh_r_cm: number | null
  calf_l_cm: number | null
  calf_r_cm: number | null
  notes: string | null
}

interface PhotoRow {
  id: string
  taken_at: string
  pose: string | null
  storage_path: string
  notes: string | null
  signed_url?: string
}

const TODAY = () => new Date().toISOString().slice(0, 10)

export function BodyMetrics() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(true)
  const [unit, setUnit] = useState<'kg' | 'lb'>('lb')
  const [tape, setTape] = useState<'cm' | 'in'>('in')
  const [metrics, setMetrics] = useState<MetricRow[]>([])
  const [photos, setPhotos] = useState<PhotoRow[]>([])

  // Today's entry form
  const [form, setForm] = useState({
    weight: '' as string,
    bodyFat: '' as string,
    neck: '' as string,
    chest: '' as string,
    waist: '' as string,
    hip: '' as string,
    armL: '' as string,
    armR: '' as string,
    thighL: '' as string,
    thighR: '' as string,
    calfL: '' as string,
    calfR: '' as string,
    notes: '' as string,
  })
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  useEffect(() => {
    if (!user) return
    let alive = true
    ;(async () => {
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(60),
        supabase.from('progress_photos').select('*').order('taken_at', { ascending: false }).limit(20),
      ])
      if (!alive) return
      const mrows = (m ?? []) as MetricRow[]
      setMetrics(mrows)
      // Prefill from latest entry
      if (mrows.length > 0) {
        const last = mrows[0]
        const wt = last.weight_kg != null ? (unit === 'lb' ? last.weight_kg / 0.453592 : last.weight_kg) : null
        const cm2in = (v: number | null) => v == null ? '' : tape === 'in' ? (v / 2.54).toFixed(2) : v.toFixed(1)
        setForm({
          weight: wt != null ? wt.toFixed(1) : '',
          bodyFat: last.body_fat_pct?.toString() ?? '',
          neck: cm2in(last.neck_cm),
          chest: cm2in(last.chest_cm),
          waist: cm2in(last.waist_cm),
          hip: cm2in(last.hip_cm),
          armL: cm2in(last.arm_l_cm),
          armR: cm2in(last.arm_r_cm),
          thighL: cm2in(last.thigh_l_cm),
          thighR: cm2in(last.thigh_r_cm),
          calfL: cm2in(last.calf_l_cm),
          calfR: cm2in(last.calf_r_cm),
          notes: '',
        })
      }
      // Sign photo URLs
      const signed: PhotoRow[] = []
      for (const ph of (p ?? []) as PhotoRow[]) {
        const { data: url } = await supabase.storage.from('progress-photos').createSignedUrl(ph.storage_path, 60 * 60)
        signed.push({ ...ph, signed_url: url?.signedUrl })
      }
      setPhotos(signed)
      setLoading(false)
    })()
    return () => { alive = false }
  }, [user])

  const save = async () => {
    setSaving(true)
    setSavedMsg('')
    const num = (s: string) => s.trim() === '' ? null : Number(s)
    const inToCm = (s: string) => {
      const v = num(s)
      if (v == null) return null
      return tape === 'in' ? v * 2.54 : v
    }
    const weightKg = (() => {
      const v = num(form.weight)
      if (v == null) return null
      return unit === 'lb' ? v * 0.453592 : v
    })()

    const { error } = await supabase.rpc('log_body_metrics', {
      p_weight_kg: weightKg,
      p_body_fat_pct: num(form.bodyFat),
      p_neck_cm: inToCm(form.neck),
      p_chest_cm: inToCm(form.chest),
      p_waist_cm: inToCm(form.waist),
      p_hip_cm: inToCm(form.hip),
      p_arm_l_cm: inToCm(form.armL),
      p_arm_r_cm: inToCm(form.armR),
      p_thigh_l_cm: inToCm(form.thighL),
      p_thigh_r_cm: inToCm(form.thighR),
      p_calf_l_cm: inToCm(form.calfL),
      p_calf_r_cm: inToCm(form.calfR),
      p_notes: form.notes || null,
    })

    if (error) {
      setSavedMsg(`Error: ${error.message}`)
    } else {
      setSavedMsg('Saved')
      // Reload metrics
      const { data: m } = await supabase.from('body_metrics').select('*').order('measured_at', { ascending: false }).limit(60)
      setMetrics((m ?? []) as MetricRow[])
    }
    setSaving(false)
    setTimeout(() => setSavedMsg(''), 3000)
  }

  const uploadPhoto = async (file: File, pose: string) => {
    if (!user) return
    const path = `${user.id}/${Date.now()}-${pose}.${file.name.split('.').pop()}`
    const { error: upErr } = await supabase.storage.from('progress-photos').upload(path, file)
    if (upErr) {
      console.error('upload err', upErr)
      return
    }
    const { error: insErr } = await supabase.from('progress_photos').insert({
      pose,
      storage_path: path,
      notes: null,
    })
    if (insErr) {
      console.error('insert err', insErr)
      return
    }
    // Reload photos
    const { data: p } = await supabase.from('progress_photos').select('*').order('taken_at', { ascending: false }).limit(20)
    const signed: PhotoRow[] = []
    for (const ph of (p ?? []) as PhotoRow[]) {
      const { data: url } = await supabase.storage.from('progress-photos').createSignedUrl(ph.storage_path, 60 * 60)
      signed.push({ ...ph, signed_url: url?.signedUrl })
    }
    setPhotos(signed)
  }

  const deletePhoto = async (ph: PhotoRow) => {
    if (!confirm('Delete this photo?')) return
    await supabase.storage.from('progress-photos').remove([ph.storage_path])
    await supabase.from('progress_photos').delete().eq('id', ph.id)
    setPhotos(prev => prev.filter(x => x.id !== ph.id))
  }

  const weightTrend = useMemo(() => {
    return metrics
      .filter(m => m.weight_kg != null)
      .map(m => ({
        date: m.measured_at,
        weight: unit === 'lb' ? Math.round((m.weight_kg as number) / 0.453592 * 10) / 10 : Math.round((m.weight_kg as number) * 10) / 10,
      }))
      .reverse()
  }, [metrics, unit])

  const waistTrend = useMemo(() => {
    return metrics
      .filter(m => m.waist_cm != null)
      .map(m => ({
        date: m.measured_at,
        waist: tape === 'in' ? Math.round((m.waist_cm as number) / 2.54 * 10) / 10 : Math.round((m.waist_cm as number) * 10) / 10,
      }))
      .reverse()
  }, [metrics, tape])

  const weightDelta = useMemo(() => {
    if (weightTrend.length < 2) return null
    return weightTrend[weightTrend.length - 1].weight - weightTrend[0].weight
  }, [weightTrend])

  if (loading) return <Spinner />

  return (
    <div className="space-y-4 max-w-5xl">
      <PageHeader
        title="Body Metrics"
        subtitle="Daily check-in, tape measurements, and progress photos"
        action={
          <div className="flex gap-2">
            <button
              onClick={() => setUnit(u => u === 'kg' ? 'lb' : 'kg')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-miami-violet/15 text-miami-violet border border-miami-violet/30"
            >
              {unit.toUpperCase()}
            </button>
            <button
              onClick={() => setTape(t => t === 'cm' ? 'in' : 'cm')}
              className="px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wide bg-miami-violet/15 text-miami-violet border border-miami-violet/30"
            >
              {tape.toUpperCase()}
            </button>
          </div>
        }
      />

      {/* Today's check-in */}
      <SectionCard title="Today's Check-In" subtitle={TODAY()}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label={`Weight (${unit})`} value={form.weight} onChange={v => setForm(f => ({ ...f, weight: v }))} />
          <Field label="Body Fat %" value={form.bodyFat} onChange={v => setForm(f => ({ ...f, bodyFat: v }))} />
          <Field label={`Neck (${tape})`} value={form.neck} onChange={v => setForm(f => ({ ...f, neck: v }))} />
          <Field label={`Chest (${tape})`} value={form.chest} onChange={v => setForm(f => ({ ...f, chest: v }))} />
          <Field label={`Waist (${tape})`} value={form.waist} onChange={v => setForm(f => ({ ...f, waist: v }))} />
          <Field label={`Hips (${tape})`} value={form.hip} onChange={v => setForm(f => ({ ...f, hip: v }))} />
          <Field label={`Arm L (${tape})`} value={form.armL} onChange={v => setForm(f => ({ ...f, armL: v }))} />
          <Field label={`Arm R (${tape})`} value={form.armR} onChange={v => setForm(f => ({ ...f, armR: v }))} />
          <Field label={`Thigh L (${tape})`} value={form.thighL} onChange={v => setForm(f => ({ ...f, thighL: v }))} />
          <Field label={`Thigh R (${tape})`} value={form.thighR} onChange={v => setForm(f => ({ ...f, thighR: v }))} />
          <Field label={`Calf L (${tape})`} value={form.calfL} onChange={v => setForm(f => ({ ...f, calfL: v }))} />
          <Field label={`Calf R (${tape})`} value={form.calfR} onChange={v => setForm(f => ({ ...f, calfR: v }))} />
        </div>
        <textarea
          placeholder="Notes (sleep, energy, soreness...)"
          value={form.notes}
          onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          className="mt-3 w-full bg-miami-bg border border-miami-violet/20 rounded-lg px-3 py-2 text-sm text-miami-text focus:border-miami-violet outline-none"
          rows={2}
        />
        <div className="flex items-center gap-3 mt-3">
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-miami to-miami-violet text-white font-bold shadow-[0_0_16px_-4px_rgba(255,45,120,0.5)] disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Check-In'}
          </button>
          {savedMsg && <span className="text-sm text-green-tier">{savedMsg}</span>}
        </div>
      </SectionCard>

      {/* Weight trend */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <SectionCard
          title={
            <div className="flex items-center justify-between">
              <span>Weight Trend</span>
              {weightDelta != null && (
                <span className={'text-xs font-bold ' + (weightDelta > 0 ? 'text-miami' : 'text-green-tier')}>
                  {weightDelta > 0 ? <TrendingUp size={14} className="inline" /> : <TrendingDown size={14} className="inline" />}
                  {' '}{weightDelta > 0 ? '+' : ''}{weightDelta.toFixed(1)} {unit}
                </span>
              )}
            </div>
          }
        >
          {weightTrend.length === 0 ? (
            <div className="text-center py-12 text-miami-text/50">
              <Scale className="mx-auto mb-2" size={24} />
              Log your first weight to see the trend
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={weightTrend}>
                  <XAxis dataKey="date" stroke="#F0EDE8" tick={{ fontSize: 10, fill: '#F0EDE8' }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="#F0EDE8" tick={{ fontSize: 10, fill: '#F0EDE8' }} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip contentStyle={{ background: '#0A0A18', border: '1px solid rgba(180,79,232,0.4)', borderRadius: 8 }} labelStyle={{ color: '#F0EDE8' }} />
                  <Line type="monotone" dataKey="weight" stroke="#FF2D78" strokeWidth={2} dot={{ fill: '#FFD700', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Waist Trend">
          {waistTrend.length === 0 ? (
            <div className="text-center py-12 text-miami-text/50">
              Log waist measurements to track lean progress
            </div>
          ) : (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={waistTrend}>
                  <XAxis dataKey="date" stroke="#F0EDE8" tick={{ fontSize: 10, fill: '#F0EDE8' }} tickFormatter={d => d.slice(5)} />
                  <YAxis stroke="#F0EDE8" tick={{ fontSize: 10, fill: '#F0EDE8' }} domain={['dataMin - 1', 'dataMax + 1']} />
                  <Tooltip contentStyle={{ background: '#0A0A18', border: '1px solid rgba(180,79,232,0.4)', borderRadius: 8 }} labelStyle={{ color: '#F0EDE8' }} />
                  <Line type="monotone" dataKey="waist" stroke="#B44FE8" strokeWidth={2} dot={{ fill: '#FFD700', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Photos */}
      <SectionCard
        title={<><Camera size={14} className="inline mr-1" /> Progress Photos</>}
        subtitle="Front · Side · Back — same lighting, same pose"
      >
        <div className="flex flex-wrap gap-3 mb-4">
          {(['front', 'side', 'back'] as const).map(pose => (
            <label key={pose} className="cursor-pointer px-3 py-2 rounded-lg bg-miami-violet/15 text-miami-violet hover:bg-miami-violet/25 text-xs font-bold uppercase tracking-wide inline-flex items-center gap-2">
              <Upload size={14} /> {pose}
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0]
                  if (f) uploadPhoto(f, pose)
                  e.target.value = ''
                }}
              />
            </label>
          ))}
        </div>

        {photos.length === 0 ? (
          <div className="text-center py-8 text-miami-text/50">
            <Camera className="mx-auto mb-2" size={24} />
            No photos yet. Photos are private and only visible to you.
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {photos.map(ph => (
              <div key={ph.id} className="relative group rounded-lg overflow-hidden bg-miami-bg border border-miami-violet/20">
                {ph.signed_url && <img src={ph.signed_url} alt={ph.pose ?? ''} className="w-full aspect-[3/4] object-cover" />}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <div className="text-[10px] uppercase tracking-wide text-miami-text/70">{ph.taken_at.slice(0, 10)}</div>
                  {ph.pose && <div className="text-xs font-bold text-miami-text capitalize">{ph.pose}</div>}
                </div>
                <button
                  onClick={() => deletePhoto(ph)}
                  className="absolute top-1 right-1 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-red-tier transition-all"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[10px] uppercase tracking-wide text-miami-text/50 mb-1">{label}</label>
      <input
        type="number"
        inputMode="decimal"
        step="0.1"
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-miami-bg border border-miami-violet/20 rounded-md px-2 py-1.5 text-miami-text tabular-nums focus:border-miami-violet outline-none"
      />
    </div>
  )
}
