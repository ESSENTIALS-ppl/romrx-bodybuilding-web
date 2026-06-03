import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { Spinner } from '../components/Spinner'
import { EmptyState } from '../components/EmptyState'
import { cn, beltColor } from '../lib/utils'
import { supabase } from '../lib/supabase'
import {
  Users, Flame, FileText, Search, X, Printer,
  ChevronDown, Save, AlertTriangle, ClipboardList,
  Zap, GraduationCap, BookOpen, ChevronRight,
  Award, Video, Dumbbell, NotebookPen, Plus, CheckCircle2,
  Syringe, ShieldPlus, ChevronLeft, ChevronRight as ChevronR,
} from 'lucide-react'
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis,
  ResponsiveContainer,
} from 'recharts'

// ── Constants ──────────────────────────────────────────────────────────────────
const COACH_ROSTER_URL  = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/get-coach-roster`
const COACH_ACTIONS_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-actions`

const TYPE_LABEL: Record<string, string> = {
  T: 'Takedowns', P: 'Passes', G: 'Guards', S: 'Sweeps', C: 'Controls', X: 'Submissions',
}

const RAMP_STEPS = [
  { key: 'raise',      label: 'R — Raise',      minutes: '3 min', field: 'raise_drills',      bg: 'bg-teal',      text: 'text-white' },
  { key: 'activate',   label: 'A — Activate',   minutes: '5 min', field: 'activate_drills',   bg: 'bg-gold',      text: 'text-charcoal' },
  { key: 'mobilize',   label: 'M — Mobilize',   minutes: '5 min', field: 'mobilize_drills',   bg: 'bg-charcoal',  text: 'text-white' },
  { key: 'potentiate', label: 'P — Potentiate', minutes: '7 min', field: 'potentiate_drills', bg: 'bg-teal-dark', text: 'text-white' },
] as const

const BELT_ORDER = ['white', 'blue', 'purple', 'brown', 'black']
const CATEGORIES = ['Takedowns', 'Guards', 'Passes', 'Sweeps', 'Controls', 'Submissions']

const BODY_PARTS = ['Shoulder', 'Knee', 'Ankle', 'Wrist', 'Neck', 'Hip', 'Elbow', 'Finger/Hand', 'Rib', 'Back', 'Other']
const MECHANISMS = ['Tap late', 'Hard landing', 'Drilling', 'Overuse', 'Unknown']
const SIDES = ['Left', 'Right', 'Both', 'N/A']

const CUE_SECTION_META = [
  { prefix: 'Why it works:', emoji: '💡', label: 'Why It Works',  bg: 'bg-teal/10',     border: 'border-teal/20',    text: 'text-teal' },
  { prefix: 'Verbal cue:',   emoji: '🗣',  label: 'Verbal Cue',   bg: 'bg-gold/10',     border: 'border-gold/20',    text: 'text-gold' },
  { prefix: 'Visual demo:',  emoji: '👁',  label: 'Visual Demo',  bg: 'bg-sky-50',      border: 'border-sky-200',    text: 'text-sky-700' },
  { prefix: 'Tactile cue:',  emoji: '🤲', label: 'Tactile Cue',  bg: 'bg-violet-50',   border: 'border-violet-200', text: 'text-violet-700' },
  { prefix: 'Common error:', emoji: '⚠️', label: 'Common Error', bg: 'bg-red-50',      border: 'border-red-200',    text: 'text-red-tier' },
  { prefix: 'Fix:',          emoji: '✅', label: 'The Fix',      bg: 'bg-green-50',    border: 'border-green-200',  text: 'text-green-tier' },
]

// ── Types ──────────────────────────────────────────────────────────────────────
interface AthleteGamePlan {
  id: string; name: string; path_mode: string
  techniques: Array<{ name: string; category: string }>; created_at: string
}
interface AthleteRosterItem {
  id: string; user_id?: string; email: string; name: string; belt: string; gym: string | null
  lastAssessmentDate: string | null
  techniques: { green: number; yellow: number; red: number; total: number }
  priorityJoints: Array<{ joint: string; gap: number; left: number; right: number }>
}
interface TechniqueWarmup {
  code: string; technique_name: string; belt: string; technique_type: string; primary_joints: string
  raise_drills: string; activate_drills: string; mobilize_drills: string; potentiate_drills: string
  coaching_cue: string | null; submission_type: string | null
}
interface TechniqueItem {
  code: string; technique_name: string; belt: string; technique_type: string; primary_joints: string; submission_type?: string | null
}
interface AthleteNote {
  id: string; athlete_id: string; note: string; updated_at: string
}
interface JointDetail {
  joint: string; display: string; actual: number | null
  side: string; severity: 'minor' | 'moderate' | 'significant' | null
}
interface TechniqueReadinessItem {
  user_id: string; name: string; belt: string; tier: string
  joint_details: JointDetail[]; injuries: Array<{ body_part: string; stage: number }>
}
interface TeachingEntry {
  id: string; technique_code: string; technique_name: string; technique_type: string; notes: string | null; taught_at: string
}

type Tab = 'team' | 'coaching' | 'competitions' | 'injury' | 'school'
type TeamSubTab = 'roster' | 'notes'
type CoachingSubTab = 'technique' | 'journal'

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(iso: string | null): string {
  if (!iso) return 'Not yet assessed'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function jointDotColor(gap: number): string {
  if (gap >= 15) return 'bg-red-tier'
  if (gap >= 8)  return 'bg-gold'
  return 'bg-green-tier'
}
function formatJointName(j: string): string {
  return j.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
function groupTechniques(techniques: TechniqueItem[]): Record<string, Record<string, TechniqueItem[]>> {
  const result: Record<string, Record<string, TechniqueItem[]>> = {}
  for (const t of techniques) {
    const belt = t.belt ? (t.belt.charAt(0).toUpperCase() + t.belt.slice(1)) : 'White'
    const typeFull = t.technique_type === 'X' && t.submission_type
      ? `Submissions - ${t.submission_type}`
      : (TYPE_LABEL[t.technique_type] ?? t.technique_type)
    if (!result[belt]) result[belt] = {}
    if (!result[belt][typeFull]) result[belt][typeFull] = []
    result[belt][typeFull].push(t)
  }
  return result
}
function parseCue(cueText: string) {
  const result: Array<{ prefix: string; text: string; emoji: string; label: string; bg: string; border: string; text2: string }> = []
  for (const s of CUE_SECTION_META) {
    const idx = cueText.indexOf(s.prefix)
    if (idx === -1) continue
    const start = idx + s.prefix.length
    let end = cueText.length
    for (const other of CUE_SECTION_META) {
      if (other.prefix === s.prefix) continue
      const oIdx = cueText.indexOf(other.prefix, idx + 1)
      if (oIdx !== -1 && oIdx < end) end = oIdx
    }
    result.push({ prefix: s.prefix, text: cueText.slice(start, end).trim(), emoji: s.emoji, label: s.label, bg: s.bg, border: s.border, text2: s.text })
  }
  return result
}

// ── Readiness ─────────────────────────────────────────────────────────────────
function getReadiness(t: { green: number; yellow: number; red: number; total: number }) {
  if (t.total === 0) return { label: 'No Data', color: 'gray' }
  const greenPct = t.green / t.total
  const redPct = t.red / t.total
  if (redPct > 0.6)   return { label: 'AT RISK',    color: 'red' }
  if (greenPct > 0.55) return { label: 'READY',     color: 'green' }
  return { label: 'DEVELOPING', color: 'yellow' }
}
function readinessSortKey(item: AthleteRosterItem): number {
  const r = getReadiness(item.techniques)
  if (r.label === 'AT RISK') return 0
  if (r.label === 'DEVELOPING') return 1
  if (r.label === 'READY') return 2
  return 3
}
function ReadinessPill({ t }: { t: { green: number; yellow: number; red: number; total: number } }) {
  const r = getReadiness(t)
  const cls =
    r.color === 'red'    ? 'bg-red-tier-bg text-red-tier' :
    r.color === 'green'  ? 'bg-green-tier-bg text-green-tier' :
    r.color === 'yellow' ? 'bg-yellow-tier-bg text-yellow-tier' :
                           'bg-surface text-charcoal-light'
  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wide', cls)}>
      {r.label}
    </span>
  )
}
function BeltBadge({ belt }: { belt: string }) {
  return (
    <span className={cn('text-[11px] px-2 py-0.5 rounded-full font-semibold capitalize', beltColor(belt.toLowerCase()))}>
      {belt}
    </span>
  )
}
function TierCounts({ green, yellow, red }: { green: number; yellow: number; red: number }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      <span className="tier-green text-[11px] px-2 py-0.5 rounded-full">{green} G</span>
      <span className="tier-yellow text-[11px] px-2 py-0.5 rounded-full">{yellow} Y</span>
      <span className="tier-red    text-[11px] px-2 py-0.5 rounded-full">{red} R</span>
    </div>
  )
}
function JointFlag({ joint, gap, onDismiss }: { joint: string; gap: number; onDismiss?: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 text-xs bg-surface rounded-xl px-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <div className={cn('w-2 h-2 rounded-full shrink-0', jointDotColor(gap))} />
        <span className="text-charcoal font-medium truncate">{formatJointName(joint)}</span>
        <span className="text-charcoal-light shrink-0">{gap}deg</span>
      </div>
      {onDismiss && (
        <button onClick={onDismiss} className="shrink-0 text-charcoal-light hover:text-charcoal transition-colors" aria-label="Dismiss">
          <X size={12} />
        </button>
      )}
    </div>
  )
}

// ── Inline Note Editor ─────────────────────────────────────────────────────────
function InlineNoteEditor({ athleteId, initialNote, session, onClose, onSaved }: {
  athleteId: string; initialNote: string; session: { access_token: string } | null
  onClose: () => void; onSaved?: (note: string) => void
}) {
  const [note, setNote] = useState(initialNote)
  const [loading, setLoading] = useState(!initialNote)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Load existing note if not provided
  useEffect(() => {
    if (initialNote || !session || !athleteId) { setLoading(false); return }
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_note_for_athlete', athlete_id: athleteId }),
    }).then(r => r.json()).then(d => { setNote(d.note ?? ''); setLoading(false) }).catch(() => setLoading(false))
  }, [athleteId, session, initialNote])

  async function handleSave() {
    if (!session) return
    setSaving(true)
    try {
      await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_note', athlete_id: athleteId, note }),
      })
      setSaved(true)
      onSaved?.(note)
      setTimeout(() => { setSaved(false); onClose() }, 1400)
    } finally { setSaving(false) }
  }

  if (loading) return <div className="mt-3 border-t border-teal-light pt-3"><Spinner /></div>
  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Add a coaching note..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none" />
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSave} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
          {saved ? '✓ Saved' : saving ? 'Saving...' : <><Save size={12} /> Save Note</>}
        </button>
      </div>
    </div>
  )
}

// ── Promote Dialog ─────────────────────────────────────────────────────────────
function PromoteDialog({ athlete, onPromote, onClose }: {
  athlete: AthleteRosterItem; onPromote: (belt: string) => Promise<void>; onClose: () => void
}) {
  const currentIdx = BELT_ORDER.indexOf(athlete.belt.toLowerCase())
  const options = BELT_ORDER.slice(currentIdx + 1)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  async function handlePromote() {
    if (!selected) return
    setSaving(true)
    try {
      await onPromote(selected)
      setMsg({ type: 'ok', text: `Promoted to ${selected}!` })
      setTimeout(onClose, 1500)
    } catch (e) {
      setMsg({ type: 'err', text: e instanceof Error ? e.message : 'Promotion failed' })
    } finally { setSaving(false) }
  }

  if (options.length === 0) return (
    <div className="mt-3 border-t border-teal-light pt-3 text-xs text-charcoal-light">
      {athlete.name} is already at the highest belt rank.
      <button onClick={onClose} className="ml-2 text-teal hover:underline">Close</button>
    </div>
  )
  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal">Promote to:</p>
      <div className="flex gap-1.5 flex-wrap">
        {options.map(b => (
          <button key={b} onClick={() => setSelected(b)}
            className={cn('px-3 py-1 rounded-full text-xs font-bold uppercase transition-all', beltColor(b), selected === b ? 'ring-2 ring-offset-1 ring-teal' : 'opacity-60 hover:opacity-90')}>
            {b}
          </button>
        ))}
      </div>
      {msg && <p className={cn('text-xs', msg.type === 'ok' ? 'text-green-tier' : 'text-red-tier')}>{msg.text}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handlePromote} disabled={!selected || saving} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
          {saving ? 'Promoting...' : <><Award size={12} /> Confirm Promotion</>}
        </button>
      </div>
    </div>
  )
}

// ── Assign Drill Form ──────────────────────────────────────────────────────────
function AssignDrillForm({ athlete, coachId, onClose }: { athlete: AthleteRosterItem; coachId: string; onClose: () => void }) {
  const [techniqueName, setTechniqueName] = useState('')
  const [category, setCategory] = useState('Takedowns')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit() {
    if (!techniqueName.trim()) { setErr('Technique name is required.'); return }
    if (!athlete.user_id) { setErr('Athlete user ID not found.'); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('coach_assignments').insert({
      coach_id: coachId, athlete_user_id: athlete.user_id,
      technique_name: techniqueName.trim(), category, note: note.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(error.message) } else { setSaved(true); setTimeout(onClose, 1200) }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal">Assign Drill to {athlete.name}</p>
      <input type="text" value={techniqueName} onChange={e => setTechniqueName(e.target.value)} placeholder="Technique name (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors" />
      <select value={category} onChange={e => setCategory(e.target.value)}
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors">
        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
      <textarea value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Optional note for athlete..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
      {err && <p className="text-xs text-red-tier">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
          {saved ? '✓ Assigned!' : saving ? 'Saving...' : <><Dumbbell size={12} /> Assign Drill</>}
        </button>
      </div>
    </div>
  )
}

// ── Add Video Form ─────────────────────────────────────────────────────────────
function AddVideoForm({ athlete, coachId, onClose }: { athlete: AthleteRosterItem; coachId: string; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [url, setUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  function validateUrl(u: string) { return u.startsWith('https://youtu.be') || u.startsWith('https://www.youtube.com') }

  async function handleSubmit() {
    if (!title.trim()) { setErr('Title is required.'); return }
    if (!url.trim() || !validateUrl(url.trim())) { setErr('Enter a valid YouTube URL.'); return }
    if (!athlete.user_id) { setErr('Athlete user ID not found.'); return }
    setSaving(true); setErr(null)
    const { error } = await supabase.from('coach_video_feedback').insert({
      coach_id: coachId, athlete_user_id: athlete.user_id,
      youtube_url: url.trim(), title: title.trim(), notes: notes.trim() || null,
    })
    setSaving(false)
    if (error) { setErr(error.message) } else { setSaved(true); setTimeout(onClose, 1200) }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal">Add Video for {athlete.name}</p>
      <input type="text" value={title} onChange={e => setTitle(e.target.value)} placeholder="Video title (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors" />
      <input type="url" value={url} onChange={e => setUrl(e.target.value)} placeholder="YouTube URL (required)"
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors" />
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
      {err && <p className="text-xs text-red-tier">{err}</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50">
          {saved ? '✓ Added!' : saving ? 'Saving...' : <><Video size={12} /> Add Video</>}
        </button>
      </div>
    </div>
  )
}

// ── Injury Form ────────────────────────────────────────────────────────────────
function InjuryForm({ athlete, session, onClose }: {
  athlete: AthleteRosterItem; session: { access_token: string } | null; onClose: () => void
}) {
  const [bodyPart, setBodyPart] = useState('')
  const [severity, setSeverity] = useState(5)
  const [side, setSide] = useState('Unknown')
  const [mechanism, setMechanism] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit() {
    if (!bodyPart || !athlete.user_id || !session) { setErr('Select a body part'); return }
    setSaving(true); setErr(null)
    try {
      const res = await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'log_injury', athlete_user_id: athlete.user_id, body_part: bodyPart, severity, side, mechanism: mechanism || null, notes: notes.trim() || null }),
      })
      const data = await res.json()
      if (data.error) { setErr(data.error); return }
      setSaved(true)
      setTimeout(onClose, 1500)
    } finally { setSaving(false) }
  }

  return (
    <div className="mt-3 border-t border-teal-light pt-3 space-y-2">
      <p className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
        <Syringe size={12} className="text-red-tier" /> Report Injury — {athlete.name}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <select value={bodyPart} onChange={e => setBodyPart(e.target.value)}
          className="text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors">
          <option value="">Body part...</option>
          {BODY_PARTS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select value={side} onChange={e => setSide(e.target.value)}
          className="text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors">
          {SIDES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-charcoal-light shrink-0">Severity: {severity}/10</span>
        <input type="range" min={1} max={10} value={severity} onChange={e => setSeverity(Number(e.target.value))} className="flex-1 accent-teal" />
      </div>
      <select value={mechanism} onChange={e => setMechanism(e.target.value)}
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors">
        <option value="">Mechanism (optional)...</option>
        {MECHANISMS.map(m => <option key={m} value={m}>{m}</option>)}
      </select>
      <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Optional notes..."
        className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
      {err && <p className="text-xs text-red-tier">{err}</p>}
      {saved && <p className="text-xs text-green-tier flex items-center gap-1"><CheckCircle2 size={12} /> Injury logged. Stage 0 — Off Mat assigned.</p>}
      <div className="flex gap-2 justify-end">
        <button onClick={onClose} className="text-xs text-charcoal-light hover:text-charcoal px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
        <button onClick={handleSubmit} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5 disabled:opacity-50 bg-red-tier hover:bg-red-tier/90">
          {saved ? '✓ Logged' : saving ? 'Saving...' : <><Syringe size={12} /> Log Injury</>}
        </button>
      </div>
    </div>
  )
}

// ── Athlete Game Plans ─────────────────────────────────────────────────────────
function AthleteGamePlans({ athleteUserId, session }: { athleteUserId: string; session: { access_token: string } | null }) {
  const [plans, setPlans] = useState<AthleteGamePlan[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded || !athleteUserId || !session) return
    setLoading(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_athlete_game_plans', athlete_user_id: athleteUserId }),
    }).then(r => r.json()).then(data => { setPlans(Array.isArray(data.plans) ? data.plans : []); setLoading(false) }).catch(() => setLoading(false))
  }, [athleteUserId, session, expanded])

  return (
    <div className="border-t border-teal-light pt-3">
      <button onClick={() => setExpanded(o => !o)} className="flex items-center justify-between w-full text-xs font-semibold text-charcoal-light hover:text-charcoal transition-colors">
        <span className="flex items-center gap-1.5"><BookOpen size={12} className="text-teal" /> Game Plans</span>
        <ChevronRight size={12} className={cn('transition-transform', expanded && 'rotate-90')} />
      </button>
      {expanded && (
        <div className="mt-2 space-y-2">
          {loading ? <p className="text-xs text-charcoal-light py-2">Loading...</p> :
           plans.length === 0 ? <p className="text-xs text-charcoal-light py-1">No game plans saved yet.</p> :
           plans.map(plan => (
            <div key={plan.id} className="bg-surface rounded-xl px-3 py-2 space-y-1">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <p className="text-xs font-semibold text-charcoal leading-snug truncate">{plan.name}</p>
                  {plan.path_mode === 'competition' && (
                    <span className="shrink-0 text-[9px] font-bold bg-red-tier text-white px-1.5 py-0.5 rounded-full uppercase tracking-wide">COMP</span>
                  )}
                </div>
                <span className="text-[10px] text-charcoal-light shrink-0">{new Date(plan.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
              {plan.techniques && plan.techniques.length > 0 && (
                <p className="text-[10px] text-charcoal-light leading-relaxed">{plan.techniques.map(t => t.name).join(' \u2192 ')}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Athlete Card ───────────────────────────────────────────────────────────────
function AthleteCard({ athlete, session, coachId, drillCount, protocolCount, onBeltUpdate, noteText, onNoteUpdated }: {
  athlete: AthleteRosterItem; session: { access_token: string } | null; coachId: string | null
  drillCount: number; protocolCount: number; onBeltUpdate: (userId: string, newBelt: string) => void
  noteText: string; onNoteUpdated: (athleteId: string, note: string) => void
}) {
  const [noteOpen, setNoteOpen]           = useState(false)
  const [promoteOpen, setPromoteOpen]     = useState(false)
  const [assignDrillOpen, setAssignDrillOpen] = useState(false)
  const [addVideoOpen, setAddVideoOpen]   = useState(false)
  const [injuryOpen, setInjuryOpen]       = useState(false)

  const visibleJoints = athlete.priorityJoints.slice(0, 3)
  const readiness = getReadiness(athlete.techniques)
  const borderClass =
    readiness.color === 'red'    ? 'border-red-tier/70' :
    readiness.color === 'green'  ? 'border-green-tier/60' :
    readiness.color === 'yellow' ? 'border-gold/60' :
                                   'border-teal-light'

  async function handlePromote(newBelt: string) {
    const { data, error } = await supabase.rpc('coach_promote_athlete', { p_athlete_user_id: athlete.user_id, p_new_belt: newBelt })
    if (error) throw new Error(error.message)
    if (data?.ok === false) throw new Error(data?.error ?? 'Promotion failed')
    if (athlete.user_id) onBeltUpdate(athlete.user_id, newBelt)
  }

  function closeAll() { setNoteOpen(false); setPromoteOpen(false); setAssignDrillOpen(false); setAddVideoOpen(false); setInjuryOpen(false) }

  return (
    <div className={cn('bg-white rounded-2xl border-2 p-4 flex flex-col gap-3 transition-colors', borderClass)}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-bold text-charcoal leading-snug truncate">{athlete.name}</p>
          <p className="text-xs text-charcoal-light truncate">{athlete.email}</p>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <BeltBadge belt={athlete.belt} />
          <ReadinessPill t={athlete.techniques} />
        </div>
      </div>

      {/* Last assessment row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {athlete.lastAssessmentDate ? (
          <span className="text-xs text-charcoal-light">Assessed: <span className="font-medium text-charcoal">{formatDate(athlete.lastAssessmentDate)}</span></span>
        ) : (
          <span className="text-xs font-semibold text-gold bg-gold/10 px-2 py-0.5 rounded-full">Not yet assessed</span>
        )}
        {drillCount > 0 && <span className="text-[10px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-medium">{drillCount} drill{drillCount !== 1 ? 's' : ''}</span>}
        <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-medium',
          protocolCount >= 5 ? 'bg-green-tier-bg text-green-tier' : protocolCount >= 3 ? 'bg-yellow-tier-bg text-yellow-tier' : 'bg-surface text-charcoal-light')}>
          {protocolCount}/7 ROM this wk
        </span>
      </div>

      {/* Technique tiers */}
      <TierCounts green={athlete.techniques.green} yellow={athlete.techniques.yellow} red={athlete.techniques.red} />

      {/* Note snippet */}
      {noteText && (
        <p className="text-[11px] text-charcoal-light bg-surface rounded-xl px-3 py-1.5 line-clamp-2 italic">
          "{noteText}"
        </p>
      )}

      {/* Priority joints */}
      {visibleJoints.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wide flex items-center gap-1">
            <AlertTriangle size={10} className="text-gold" /> Priority Joints
          </p>
          {visibleJoints.map(j => <JointFlag key={j.joint} joint={j.joint} gap={j.gap} />)}
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-1.5">
        <button onClick={() => { closeAll(); setNoteOpen(o => !o) }}
          className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
            noteOpen ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
          <FileText size={12} />{noteOpen ? 'Close Notes' : 'Notes'}
        </button>

        {coachId && athlete.user_id && (<>
          <button onClick={() => { closeAll(); setPromoteOpen(o => !o) }}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
              promoteOpen ? 'bg-charcoal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
            <Award size={12} /> Promote
          </button>
          <button onClick={() => { closeAll(); setAssignDrillOpen(o => !o) }}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
              assignDrillOpen ? 'bg-teal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
            <Dumbbell size={12} /> Assign Drill
          </button>
          <button onClick={() => { closeAll(); setAddVideoOpen(o => !o) }}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
              addVideoOpen ? 'bg-teal text-white' : 'bg-surface text-charcoal-light hover:text-charcoal hover:bg-gray-100')}>
            <Video size={12} /> Add Video
          </button>
          <button onClick={() => { closeAll(); setInjuryOpen(o => !o) }}
            className={cn('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl transition-all',
              injuryOpen ? 'bg-red-tier text-white' : 'bg-red-50 text-red-tier hover:bg-red-100')}>
            <Syringe size={12} /> Injury
          </button>
        </>)}
      </div>

      {noteOpen && <InlineNoteEditor athleteId={athlete.id} initialNote={noteText} session={session} onClose={() => setNoteOpen(false)} onSaved={n => onNoteUpdated(athlete.id, n)} />}
      {promoteOpen && coachId && <PromoteDialog athlete={athlete} onPromote={handlePromote} onClose={() => setPromoteOpen(false)} />}
      {assignDrillOpen && coachId && <AssignDrillForm athlete={athlete} coachId={coachId} onClose={() => setAssignDrillOpen(false)} />}
      {addVideoOpen && coachId && <AddVideoForm athlete={athlete} coachId={coachId} onClose={() => setAddVideoOpen(false)} />}
      {injuryOpen && <InjuryForm athlete={athlete} session={session} onClose={() => setInjuryOpen(false)} />}
      <AthleteGamePlans athleteUserId={athlete.user_id ?? ''} session={session} />
    </div>
  )
}

// ── RAMP Card ──────────────────────────────────────────────────────────────────
function RampCard({ label, minutes, drills, bg, text }: { label: string; minutes: string; drills: string; bg: string; text: string }) {
  const items = drills.split(';').map(s => s.trim()).filter(Boolean)
  return (
    <div className={cn('rounded-2xl p-4 flex flex-col gap-2', bg, text)}>
      <div>
        <p className="text-xs font-bold uppercase tracking-widest opacity-75">{minutes}</p>
        <p className="font-display font-bold text-base leading-tight">{label}</p>
      </div>
      <ul className="space-y-1">
        {items.map((drill, i) => (
          <li key={i} className="flex items-start gap-2 text-xs leading-snug">
            <span className="opacity-60 shrink-0 mt-0.5">-</span><span>{drill}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ── Coaching Cue Card (visual) ─────────────────────────────────────────────────
function CoachingCueCard({ cue }: { cue: string }) {
  const sections = parseCue(cue)
  if (sections.length === 0) return (
    <div className="mt-3 rounded-2xl border border-gold/40 bg-gold/10 p-4">
      <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-2 flex items-center gap-1.5">
        <GraduationCap size={13} className="text-gold" /> Coaching Cue
      </p>
      <p className="text-xs text-charcoal leading-relaxed whitespace-pre-wrap">{cue}</p>
    </div>
  )
  return (
    <div className="mt-3 space-y-2">
      <p className="text-xs font-bold text-charcoal uppercase tracking-wide flex items-center gap-1.5">
        <GraduationCap size={13} className="text-gold" /> Coaching Cue
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {sections.map((s, i) => (
          <div key={i} className={cn('rounded-xl border p-3', s.bg, s.border)}>
            <p className={cn('text-[10px] font-bold uppercase tracking-wide mb-1', s.text2)}>
              {s.emoji} {s.label}
            </p>
            <p className="text-xs text-charcoal leading-relaxed">{s.text}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Technique Readiness Panel ──────────────────────────────────────────────────
function TechniqueReadinessPanel({ session, code }: {
  session: { access_token: string } | null; code: string
}) {
  const [readiness, setReadiness] = useState<TechniqueReadinessItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session || !code) return
    setLoading(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_technique_readiness', code }),
    }).then(r => r.json()).then(data => {
      setReadiness(Array.isArray(data.readiness) ? data.readiness : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session, code])

  if (loading) return <div className="text-xs text-charcoal-light py-2 italic">Loading athlete readiness...</div>
  if (readiness.length === 0) return null

  return (
    <div className="mt-4 rounded-2xl border border-teal-light bg-white p-4">
      <div className="mb-3">
        <p className="text-xs font-bold text-charcoal uppercase tracking-wide flex items-center gap-1.5">
          <Users size={13} className="text-teal" /> Athlete Readiness
        </p>
      </div>
      <div className="space-y-3">
        {readiness.map(r => {
          const hasInjury = r.injuries.length > 0
          const tier = (r.tier ?? 'unassessed').toLowerCase()
          const tierBadgeColor =
            tier === 'green'  ? 'text-green-tier bg-green-tier-bg' :
            tier === 'yellow' ? 'text-gold bg-yellow-tier-bg' :
            tier === 'red'    ? 'text-red-tier bg-red-tier-bg' :
                                'text-charcoal-light bg-surface'
          const tierLabel = tier === 'green' ? 'READY' : tier === 'yellow' ? 'DEVELOPING' : tier === 'red' ? 'AT RISK' : 'UNASSESSED'
          const hasJointDetails = (r.joint_details ?? []).length > 0
          return (
            <div key={r.user_id} className={cn(
              'rounded-xl p-3 border',
              tier === 'red' ? 'border-red-tier/30 bg-red-50/50' :
              tier === 'yellow' ? 'border-gold/30 bg-gold/5' :
              tier === 'green' ? 'border-green-tier/30 bg-green-50/50' :
              'border-teal-light bg-surface'
            )}>
              {/* Athlete header row */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  {hasInjury && <span title="Active injury">🩹</span>}
                  <span className="text-xs font-semibold text-charcoal truncate">{r.name}</span>
                  {hasInjury && (
                    <span className="text-[10px] text-red-tier bg-red-50 px-1.5 py-0.5 rounded-full shrink-0">
                      {r.injuries.map(i => i.body_part).join(', ')}
                    </span>
                  )}
                </div>
                <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase shrink-0', tierBadgeColor)}>
                  {tierLabel}
                </span>
              </div>

              {/* Joint limitation details - actual value + severity, NO threshold exposed */}
              {hasJointDetails && (
                <div className="mt-2 space-y-1">
                  {(r.joint_details ?? []).map(j => {
                    const sevColor =
                      j.severity === 'significant' ? 'text-red-tier' :
                      j.severity === 'moderate'    ? 'text-gold' :
                                                     'text-charcoal-light'
                    // Always show a label — fall back to 'limiting joint' if no threshold data
                    const sevLabel =
                      j.severity === 'significant' ? 'significant limitation' :
                      j.severity === 'moderate'    ? 'moderate limitation' :
                      j.severity === 'minor'       ? 'minor limitation' :
                                                     'limiting joint'
                    return (
                      <div key={j.joint} className="flex items-center gap-2 text-[11px] pl-1">
                        <span className="font-medium text-charcoal-light w-24 shrink-0">
                          {j.display}{j.side && j.side !== 'mid' ? ` (${j.side})` : ''}
                        </span>
                        {j.actual !== null && (
                          <span className="font-semibold text-charcoal">{j.actual}°</span>
                        )}
                        <span className={cn('font-medium', sevColor)}>— {sevLabel}</span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Green = all clear */}
              {tier === 'green' && (
                <p className="text-[11px] text-green-tier mt-1.5 pl-1">All ROM requirements met</p>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── TAB: ROSTER ────────────────────────────────────────────────────────────────
function RosterTab({ roster, setRoster, loading, session, coachId, drillCounts, protocolCounts, noteMap, onNoteUpdated }: {
  roster: AthleteRosterItem[]; setRoster: React.Dispatch<React.SetStateAction<AthleteRosterItem[]>>
  loading: boolean; session: { access_token: string } | null; coachId: string | null
  drillCounts: Record<string, number>; protocolCounts: Record<string, number>
  noteMap: Record<string, string>; onNoteUpdated: (athleteId: string, note: string) => void
}) {
  const [search, setSearch] = useState('')
  const sorted = [...roster].sort((a, b) => readinessSortKey(a) - readinessSortKey(b))
  const filtered = sorted.filter(a => !search || a.name.toLowerCase().includes(search.toLowerCase()))

  function handleBeltUpdate(userId: string, newBelt: string) {
    setRoster(prev => prev.map(a => a.user_id === userId ? { ...a, belt: newBelt } : a))
  }

  if (loading) return <Spinner />
  return (
    <div className="space-y-4">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-charcoal-light" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search athletes..."
          className="w-full pl-8 pr-4 py-2 text-sm rounded-xl border border-teal-light bg-surface focus:outline-none focus:border-teal focus:bg-white transition-colors" />
      </div>
      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="No athletes found" description={search ? 'Try a different name.' : 'No athletes on your roster yet.'} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map(a => (
            <AthleteCard key={a.id} athlete={a} session={session} coachId={coachId}
              drillCount={a.user_id ? (drillCounts[a.user_id] ?? 0) : 0}
              protocolCount={a.user_id ? (protocolCounts[a.user_id] ?? 0) : 0}
              onBeltUpdate={handleBeltUpdate}
              noteText={noteMap[a.id] ?? ''}
              onNoteUpdated={onNoteUpdated}
            />
          ))}
        </div>
      )}
      <p className="text-xs text-charcoal-light text-center pt-2">
        Athletes are informed that their full ROM data is visible to their connected coach per the ROMRxBodyBuilding Terms of Service.
      </p>
    </div>
  )
}

// ── TAB: COACHING (Warmup Generator + Cue + Readiness) ────────────────────────
function WarmupTab({ session, techniques, loadingTechs, selectedCode, setSelectedCode, warmup, setWarmup, onAddToJournal }: {
  session: { access_token: string } | null
  techniques: TechniqueItem[]; loadingTechs: boolean
  selectedCode: string; setSelectedCode: (c: string) => void
  warmup: TechniqueWarmup | null; setWarmup: (w: TechniqueWarmup | null) => void
  onAddToJournal: (code: string, name: string, type: string, notes: string) => void
}) {
  const [loadingWarmup, setLoadingWarmup] = useState(false)
  const [dropdownOpen, setDropdownOpen]   = useState(false)
  const [sessionNotes, setSessionNotes]   = useState('')
  const [loggedMsg, setLoggedMsg]         = useState('')

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }), [session])

  async function handleSelectCode(code: string) {
    setSelectedCode(code)
    setDropdownOpen(false)
    if (!code || !session) return
    setLoadingWarmup(true)
    setWarmup(null)
    try {
      const res = await fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'get_warmup', code }) })
      const data = await res.json()
      setWarmup(data?.warmup ?? data ?? null)
    } catch { setWarmup(null) }
    finally { setLoadingWarmup(false) }
  }

  const grouped = groupTechniques(techniques)
  const beltOrder = ['White', 'Blue', 'Purple', 'Brown', 'Black']
  const selectedTech = techniques.find(t => t.code === selectedCode)

  if (loadingTechs) return <Spinner />

  return (
    <div className="space-y-4">
      {/* Dropdown */}
      <SectionCard title="Select Technique">
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(o => !o)}
            className={cn('w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all',
              selectedCode ? 'border-teal bg-teal/5' : 'border-teal-light bg-white hover:border-teal/30')}>
            <span className={cn('text-sm', selectedCode ? 'text-charcoal font-semibold' : 'text-charcoal-light')}>
              {selectedCode ? (selectedTech?.technique_name ?? selectedCode) : 'Choose a technique...'}
            </span>
            <ChevronDown size={14} className={cn('text-charcoal-light transition-transform shrink-0', dropdownOpen && 'rotate-180')} />
          </button>

          {dropdownOpen && (
            <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-teal-light shadow-lg overflow-hidden max-h-72 overflow-y-auto">
              {techniques.length === 0 ? <div className="px-4 py-3 text-xs text-charcoal-light">No techniques available.</div> : (
                beltOrder.map(belt => {
                  const types = grouped[belt]
                  if (!types) return null
                  return (
                    <div key={belt}>
                      <div className="px-4 py-2 bg-surface border-b border-teal-light/50 sticky top-0">
                        <span className={cn('text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', beltColor(belt.toLowerCase()))}>{belt} Belt</span>
                      </div>
                      {Object.entries(types).map(([typeName, items]) => (
                        <div key={typeName}>
                          <div className="px-4 py-1.5 bg-surface/50">
                            <span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wider">{typeName}</span>
                          </div>
                          {items.map(t => (
                            <button key={t.code} onClick={() => handleSelectCode(t.code)}
                              className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface transition-colors border-b border-teal-light/30 last:border-0',
                                selectedCode === t.code && 'bg-teal/5')}>
                              <span className="text-sm text-charcoal leading-snug">{t.technique_name}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })
              )}
            </div>
          )}
        </div>
      </SectionCard>

      {loadingWarmup && <Spinner />}

      {!loadingWarmup && warmup && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-display font-bold text-charcoal text-base">{warmup.technique_name}</p>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                <BeltBadge belt={warmup.belt} />
                {warmup.primary_joints.split(',').map(j => j.trim()).filter(Boolean).map(j => (
                  <span key={j} className="text-[11px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-medium">{formatJointName(j)}</span>
                ))}
              </div>
            </div>
            <button onClick={() => window.print()} className="shrink-0 flex items-center gap-1.5 text-xs font-semibold text-charcoal bg-surface hover:bg-gray-100 px-3 py-2 rounded-xl transition-colors border border-teal-light">
              <Printer size={13} /> Print
            </button>
          </div>

          {/* RAMP cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {RAMP_STEPS.map(step => (
              <RampCard key={step.key} label={step.label} minutes={step.minutes}
                drills={(warmup as unknown as Record<string, string>)[step.field] ?? ''} bg={step.bg} text={step.text} />
            ))}
          </div>

          {/* Coaching Cue - visual sections */}
          {warmup.coaching_cue && <CoachingCueCard cue={warmup.coaching_cue} />}

          {/* Athlete Readiness for this technique */}
          <TechniqueReadinessPanel session={session} code={warmup.code} />

          {/* Session Notes */}
          <div className="mt-3 rounded-2xl border border-teal-light bg-white p-4 space-y-2">
            <p className="text-xs font-bold text-charcoal uppercase tracking-wide flex items-center gap-1.5">
              <FileText size={13} className="text-teal" /> Session Notes
            </p>
            <p className="text-[11px] text-charcoal-light">
              Optional notes for this session — included when you log to Journal below.
            </p>
            <textarea
              value={sessionNotes}
              onChange={e => setSessionNotes(e.target.value)}
              rows={3}
              placeholder="e.g. 8 athletes, 20 min drilling. Blue belts struggled with the entry timing..."
              className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none"
            />
          </div>

          {/* Add Session to Journal — standalone button below everything */}
          <div className="flex items-center justify-between gap-4">
            {loggedMsg ? (
              <p className="text-xs text-green-tier flex items-center gap-1.5">
                <CheckCircle2 size={12} /> {loggedMsg}
              </p>
            ) : <span />}
            <button
              onClick={() => {
                if (!warmup) return
                onAddToJournal(warmup.code, warmup.technique_name, warmup.technique_type, sessionNotes)
                setLoggedMsg(`Logged: ${warmup.technique_name}`)
                setSessionNotes('')
                setTimeout(() => setLoggedMsg(''), 3000)
              }}
              className="btn-primary flex items-center gap-2 px-5 py-2.5 text-sm font-semibold"
            >
              <NotebookPen size={15} /> Add Session to Journal
            </button>
          </div>
        </div>
      )}

      {!loadingWarmup && !warmup && selectedCode && (
        <EmptyState icon={Flame} title="No warmup found" description="No RAMP warmup data available for this technique yet." />
      )}
      {!selectedCode && (
        <EmptyState icon={Zap} title="Select a technique" description="Choose a technique above to generate its RAMP warmup protocol." />
      )}
    </div>
  )
}

// ── TAB: JOURNAL ──────────────────────────────────────────────────────────────
const TYPE_FULL: Record<string, string> = { T: 'Takedowns', P: 'Passes', G: 'Guards', S: 'Sweeps', C: 'Controls', X: 'Submissions' }

function JournalTab({ session, pendingLog }: { session: { access_token: string } | null; pendingLog: { code: string; name: string; type: string; notes: string } | null }) {
  const [techniques, setTechniques]   = useState<TechniqueItem[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [dropOpen, setDropOpen]       = useState(false)
  const [logNote, setLogNote]         = useState('')
  const [logging, setLogging]         = useState(false)
  const [logMsg, setLogMsg]           = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [entries, setEntries]         = useState<TeachingEntry[]>([])
  const [counts, setCounts]           = useState<Record<string, number>>({})
  const [journalNote, setJournalNote] = useState('')
  const [savingNote, setSavingNote]   = useState(false)
  const [noteSaved, setNoteSaved]     = useState(false)
  const [loading, setLoading]         = useState(true)

  const authHeaders = useCallback(() => ({
    'Authorization': `Bearer ${session?.access_token ?? ''}`,
    'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    'Content-Type': 'application/json',
  }), [session])

  useEffect(() => {
    if (!session) return
    setLoading(true)
    Promise.all([
      fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'list_techniques' }) }).then(r => r.json()),
      fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'get_teaching_log' }) }).then(r => r.json()),
      fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'get_journal_note' }) }).then(r => r.json()),
    ]).then(([techData, logData, noteData]) => {
      setTechniques(Array.isArray(techData.techniques) ? techData.techniques : [])
      setEntries(Array.isArray(logData.entries) ? logData.entries : [])
      setCounts(logData.counts ?? {})
      setJournalNote(noteData.note ?? '')
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session, authHeaders])

  // Handle pending log from Coaching tab "Add to Journal" (includes session notes)
  useEffect(() => {
    if (!pendingLog || !session) return
    const tech = { code: pendingLog.code, technique_name: pendingLog.name, technique_type: pendingLog.type }
    doLog(tech, pendingLog.notes || null)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLog])

  async function doLog(tech: { code: string; technique_name: string; technique_type: string }, noteOverride: string | null) {
    if (!session) return
    setLogging(true); setLogMsg(null)
    try {
      const res = await fetch(COACH_ACTIONS_URL, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ action: 'log_technique_taught', technique_code: tech.code, technique_name: tech.technique_name, technique_type: tech.technique_type, notes: noteOverride }),
      })
      const data = await res.json()
      if (data.success && data.entry) {
        setEntries(prev => [data.entry, ...prev])
        setCounts(prev => ({ ...prev, [tech.technique_type]: (prev[tech.technique_type] ?? 0) + 1 }))
        setSelectedCode(''); setLogNote('')
        setLogMsg({ type: 'ok', text: `Logged: ${tech.technique_name}` })
        setTimeout(() => setLogMsg(null), 3000)
      } else {
        setLogMsg({ type: 'err', text: data.error ?? 'Failed to log' })
      }
    } finally { setLogging(false) }
  }

  async function handleLog() {
    const tech = techniques.find(t => t.code === selectedCode)
    if (!tech) return
    await doLog({ code: tech.code, technique_name: tech.technique_name, technique_type: tech.technique_type }, logNote.trim() || null)
  }

  async function handleSaveNote() {
    if (!session) return
    setSavingNote(true)
    try {
      await fetch(COACH_ACTIONS_URL, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ action: 'save_journal_note', note: journalNote }) })
      setNoteSaved(true); setTimeout(() => setNoteSaved(false), 2000)
    } finally { setSavingNote(false) }
  }

  const radarData = [
    { category: 'Takedowns',   value: counts['T'] ?? 0 },
    { category: 'Guards',      value: counts['G'] ?? 0 },
    { category: 'Passes',      value: counts['P'] ?? 0 },
    { category: 'Sweeps',      value: counts['S'] ?? 0 },
    { category: 'Controls',    value: counts['C'] ?? 0 },
    { category: 'Submissions', value: counts['X'] ?? 0 },
  ]
  const totalTaught = Object.values(counts).reduce((a, b) => a + b, 0)
  const grouped = groupTechniques(techniques)
  const beltOrder = ['White', 'Blue', 'Purple', 'Brown', 'Black']
  const selectedTech = techniques.find(t => t.code === selectedCode)

  if (loading) return <Spinner />

  return (
    <div className="space-y-5">
      {logMsg && (
        <div className={cn('rounded-xl px-4 py-2 text-sm flex items-center gap-2', logMsg.type === 'ok' ? 'bg-green-tier-bg text-green-tier' : 'bg-red-50 text-red-tier')}>
          {logMsg.type === 'ok' && <CheckCircle2 size={14} />}{logMsg.text}
        </div>
      )}

      <SectionCard title="Log Technique Taught">
        <div className="space-y-3">
          <div className="relative">
            <button onClick={() => setDropOpen(o => !o)} className={cn('w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border-2 text-left transition-all',
              selectedCode ? 'border-teal bg-teal/5' : 'border-teal-light bg-white hover:border-teal/30')}>
              <span className={cn('text-sm', selectedCode ? 'text-charcoal font-semibold' : 'text-charcoal-light')}>
                {selectedCode ? (selectedTech?.technique_name ?? selectedCode) : 'Select a technique you taught...'}
              </span>
              <ChevronDown size={14} className={cn('text-charcoal-light shrink-0 transition-transform', dropOpen && 'rotate-180')} />
            </button>
            {dropOpen && (
              <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white rounded-2xl border border-teal-light shadow-lg overflow-hidden max-h-64 overflow-y-auto">
                {beltOrder.map(belt => {
                  const types = grouped[belt]; if (!types) return null
                  return (
                    <div key={belt}>
                      <div className="px-4 py-2 bg-surface border-b border-teal-light/50 sticky top-0">
                        <span className={cn('text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full', beltColor(belt.toLowerCase()))}>{belt} Belt</span>
                      </div>
                      {Object.entries(types).map(([typeName, items]) => (
                        <div key={typeName}>
                          <div className="px-4 py-1.5 bg-surface/50"><span className="text-[10px] font-semibold text-charcoal-light uppercase tracking-wider">{typeName}</span></div>
                          {items.map(t => (
                            <button key={t.code} onClick={() => { setSelectedCode(t.code); setDropOpen(false) }}
                              className={cn('w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-surface transition-colors border-b border-teal-light/30 last:border-0', selectedCode === t.code && 'bg-teal/5')}>
                              <span className="text-sm text-charcoal">{t.technique_name}</span>
                            </button>
                          ))}
                        </div>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <textarea value={logNote} onChange={e => setLogNote(e.target.value)} rows={2} placeholder="Session notes (optional)..."
            className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
          <div className="flex justify-end">
            <button onClick={handleLog} disabled={!selectedCode || logging} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5 disabled:opacity-50">
              <Plus size={12} /> Log It
            </button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title={`Teaching Balance${totalTaught > 0 ? ` (${totalTaught} total)` : ''}`}>
        {totalTaught === 0 ? (
          <p className="text-xs text-charcoal-light py-4 text-center">Log techniques to see your category balance. A well-rounded coach teaches across all areas.</p>
        ) : (
          <div className="space-y-3">
            <ResponsiveContainer width="100%" height={240}>
              <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                <PolarGrid stroke="#e2f0ee" />
                <PolarAngleAxis dataKey="category" tick={{ fontSize: 11, fill: '#4a5568', fontWeight: 600 }} />
                <Radar name="Techniques Taught" dataKey="value" stroke="#0d9488" fill="#0d9488" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-2 justify-center">
              {radarData.filter(d => d.value > 0).map(d => (
                <span key={d.category} className="text-[11px] bg-surface px-2 py-1 rounded-full">
                  <span className="font-semibold text-teal">{d.value}</span><span className="text-charcoal-light ml-1">{d.category}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {entries.length > 0 && (
        <SectionCard title="Recent Teaching Log">
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {entries.slice(0, 20).map(e => (
              <div key={e.id} className="flex items-start justify-between gap-3 text-xs py-2 border-b border-teal-light/40 last:border-0">
                <div className="min-w-0">
                  <p className="font-semibold text-charcoal truncate">{e.technique_name}</p>
                  {e.notes && <p className="text-charcoal-light mt-0.5 truncate">{e.notes}</p>}
                </div>
                <div className="shrink-0 flex flex-col items-end gap-1">
                  <span className="text-[10px] bg-surface px-2 py-0.5 rounded-full text-charcoal-light font-medium">{TYPE_FULL[e.technique_type] ?? e.technique_type}</span>
                  <span className="text-[10px] text-charcoal-light">{new Date(e.taught_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      <SectionCard title="Coach Notes">
        <div className="space-y-3">
          <textarea value={journalNote} onChange={e => setJournalNote(e.target.value)} rows={5}
            placeholder="Personal coaching notes, class plans, observations, goals..."
            className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none" />
          <div className="flex justify-end">
            <button onClick={handleSaveNote} disabled={savingNote || noteSaved} className="btn-primary text-xs px-4 py-2 flex items-center gap-1.5">
              {noteSaved ? <><CheckCircle2 size={12} /> Saved</> : savingNote ? 'Saving...' : <><Save size={12} /> Save Notes</>}
            </button>
          </div>
        </div>
      </SectionCard>
    </div>
  )
}

// ── TAB: NOTES (per-athlete) ───────────────────────────────────────────────────
function NoteCard({ note, athleteName, session }: { note: AthleteNote; athleteName: string; session: { access_token: string } | null }) {
  const [text, setText] = useState(note.note)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved]   = useState(false)

  async function handleSave() {
    if (!session) return
    setSaving(true)
    try {
      await fetch(COACH_ACTIONS_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'save_note', athlete_id: note.athlete_id, note: text }),
      })
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } finally { setSaving(false) }
  }

  return (
    <SectionCard>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-bold text-charcoal">{athleteName}</p>
          <span className="text-xs text-charcoal-light">{new Date(note.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
          className="w-full text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors resize-none" />
        <div className="flex justify-end">
          <button onClick={handleSave} disabled={saving || saved} className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5">
            {saved ? '✓ Saved' : saving ? 'Saving...' : <><Save size={12} /> Save</>}
          </button>
        </div>
      </div>
    </SectionCard>
  )
}

function NotesTab({ roster, session }: { roster: AthleteRosterItem[]; session: { access_token: string } | null }) {
  const [notes, setNotes] = useState<AthleteNote[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_notes' }),
    }).then(r => r.json()).then(data => setNotes(Array.isArray(data) ? data : data.notes ?? [])).catch(() => setNotes([])).finally(() => setLoading(false))
  }, [session])

  const rosterMap = Object.fromEntries(roster.map(a => [a.id, a.name]))

  if (loading) return <Spinner />
  if (notes.length === 0) return <EmptyState icon={ClipboardList} title="No notes yet" description="Use the Notes button on each athlete card to add coaching notes." />

  return (
    <div className="space-y-3">
      {notes.map(n => <NoteCard key={n.id} note={n} athleteName={rosterMap[n.athlete_id] ?? 'Unknown Athlete'} session={session} />)}
    </div>
  )
}

// ── In Development Placeholder ───────────────────────────────────────────────
function InDevelopmentTab({ title, description, features }: {
  title: string; description: string; features: string[]
}) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 bg-surface rounded-2xl flex items-center justify-center mb-5">
        <span className="text-3xl">🚧</span>
      </div>
      <h2 className="font-display font-bold text-charcoal text-xl mb-2">{title}</h2>
      <p className="text-sm text-charcoal-light max-w-sm mb-6 leading-relaxed">{description}</p>
      <div className="bg-surface rounded-2xl p-5 max-w-sm w-full text-left">
        <p className="text-xs font-bold text-charcoal uppercase tracking-wide mb-3">Coming Features</p>
        <ul className="space-y-2">
          {features.map((f, i) => (
            <li key={i} className="flex items-start gap-2 text-xs text-charcoal-light">
              <span className="text-teal mt-0.5">•</span>
              {f}
            </li>
          ))}
        </ul>
      </div>
      <span className="mt-6 text-[11px] font-bold bg-gold/20 text-gold px-3 py-1 rounded-full uppercase tracking-wide">In Development</span>
    </div>
  )
}

// ── My Injury Tab ─────────────────────────────────────────────────────────────
const STAGE_LABELS: Record<number, { name: string; description: string; color: string }> = {
  0: { name: 'Off Mat',            description: 'Complete rest — no physical activity affecting injury.', color: 'text-red-tier' },
  1: { name: 'Cardio Only',        description: 'Bike, swim, walk — no grappling contact.',              color: 'text-red-tier' },
  2: { name: 'Solo Movement',      description: 'Individual movement patterns, no contact.',             color: 'text-gold' },
  3: { name: 'Technical Solo',     description: 'Solo drilling of non-affected techniques only.',       color: 'text-gold' },
  4: { name: 'Technical Drilling', description: 'Compliant partner, zero resistance.',                  color: 'text-gold' },
  5: { name: 'Positional (Protected)', description: 'Sparring avoiding the injury area.',             color: 'text-teal' },
  6: { name: 'Flow Rolling',       description: 'Light intensity, injury-aware partner only.',         color: 'text-teal' },
  7: { name: 'Modified Training',  description: 'Full class with specific technique restrictions.',    color: 'text-teal' },
  8: { name: 'Full Training',      description: 'No modifications — full intensity.',                  color: 'text-green-tier' },
  9: { name: 'Competition Ready',  description: 'Competition cleared — coach sign-off required.',     color: 'text-green-tier' },
}

interface InjuryRecord {
  id: string; athlete_user_id: string; body_part: string; injury_type: string
  side: string; severity: number; stage: number; status: string
  injury_date: string; notes: string | null
}

function InjuryCard({
  injury, athleteName, session, onUpdated,
}: {
  injury: InjuryRecord; athleteName: string
  session: { access_token: string } | null
  onUpdated: (id: string, stage: number, status: string) => void
}) {
  const [stageNote, setStageNote] = useState('')
  const [saving, setSaving]       = useState(false)
  const [expanded, setExpanded]   = useState(false)

  const stageInfo = STAGE_LABELS[injury.stage] ?? STAGE_LABELS[0]
  const isCleared = injury.status === 'cleared'

  async function advance(newStage: number, newStatus?: string) {
    if (!session) return
    setSaving(true)
    try {
      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-actions`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update_injury_stage', injury_id: injury.id, stage: newStage, status: newStatus ?? injury.status, notes: stageNote.trim() || null }),
      })
      onUpdated(injury.id, newStage, newStatus ?? injury.status)
    } finally { setSaving(false) }
  }

  const severityColor = injury.severity >= 8 ? 'text-red-tier' : injury.severity >= 5 ? 'text-gold' : 'text-charcoal-light'

  return (
    <div className={cn('rounded-2xl border-2 p-4 space-y-3', isCleared ? 'border-green-tier/40 bg-green-50/30' : 'border-teal-light bg-white')}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-bold text-charcoal">{athleteName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-semibold text-charcoal">{injury.body_part}</span>
            {injury.side !== 'unknown' && injury.side !== 'N/A' && (
              <span className="text-[10px] bg-surface px-2 py-0.5 rounded-full text-charcoal-light">{injury.side}</span>
            )}
            <span className={cn('text-[10px] font-semibold', severityColor)}>{injury.severity}/10</span>
            <span className="text-[10px] text-charcoal-light">{new Date(injury.injury_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
        <span className={cn('text-[10px] font-bold px-2 py-1 rounded-full uppercase', isCleared ? 'bg-green-tier-bg text-green-tier' : 'bg-red-50 text-red-tier')}>
          {isCleared ? 'Cleared' : 'Active'}
        </span>
      </div>

      {/* Stage progress bar */}
      {!isCleared && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className={cn('text-xs font-bold', stageInfo.color)}>Stage {injury.stage}/9 — {stageInfo.name}</p>
            <button onClick={() => setExpanded(o => !o)} className="text-[11px] text-charcoal-light hover:text-charcoal transition-colors">
              {expanded ? 'Less' : 'Advance'}
            </button>
          </div>
          <div className="w-full bg-teal-light rounded-full h-1.5">
            <div className="bg-teal h-1.5 rounded-full transition-all duration-500" style={{ width: `${(injury.stage / 9) * 100}%` }} />
          </div>
          <p className="text-[11px] text-charcoal-light">{stageInfo.description}</p>
        </div>
      )}

      {/* Stage advancement controls */}
      {expanded && !isCleared && (
        <div className="border-t border-teal-light pt-3 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-charcoal uppercase tracking-wide">Next Stage</p>
              <p className={cn('text-xs font-semibold', STAGE_LABELS[Math.min(injury.stage + 1, 9)]?.color)}>
                Stage {Math.min(injury.stage + 1, 9)} — {STAGE_LABELS[Math.min(injury.stage + 1, 9)]?.name}
              </p>
              <p className="text-[10px] text-charcoal-light">{STAGE_LABELS[Math.min(injury.stage + 1, 9)]?.description}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-charcoal uppercase tracking-wide">Return Protocol</p>
              {Object.entries(STAGE_LABELS).slice(injury.stage + 1, injury.stage + 4).map(([s, info]) => (
                <p key={s} className="text-[10px] text-charcoal-light">{s}: {info.name}</p>
              ))}
            </div>
          </div>
          <textarea value={stageNote} onChange={e => setStageNote(e.target.value)} rows={2}
            placeholder="Advancement notes (optional)..."
            className="w-full text-xs rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal transition-colors resize-none" />
          <div className="flex gap-2 flex-wrap">
            {injury.stage > 0 && (
              <button onClick={() => advance(injury.stage - 1)} disabled={saving}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-surface text-charcoal-light hover:text-charcoal transition-colors disabled:opacity-50">
                <ChevronLeft size={12} /> Back a Stage
              </button>
            )}
            {injury.stage < 9 && (
              <button onClick={() => advance(injury.stage + 1)} disabled={saving}
                className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-50">
                Advance to Stage {injury.stage + 1} <ChevronR size={12} />
              </button>
            )}
            {injury.stage === 9 && (
              <button onClick={() => advance(9, 'cleared')} disabled={saving}
                className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-green-tier text-white hover:bg-green-tier/90 transition-colors disabled:opacity-50">
                <CheckCircle2 size={12} /> Clear Injury
              </button>
            )}
            <button onClick={() => advance(injury.stage, 'cleared')} disabled={saving}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-xl bg-surface text-charcoal-light hover:text-charcoal transition-colors disabled:opacity-50">
              Clear Now
            </button>
          </div>
        </div>
      )}

      {injury.notes && (
        <p className="text-[11px] text-charcoal-light italic bg-surface rounded-xl px-3 py-1.5">Note: {injury.notes}</p>
      )}
    </div>
  )
}

function MyInjuryTab({ session, roster }: { session: { access_token: string } | null; roster: AthleteRosterItem[] }) {
  const [injuries, setInjuries] = useState<InjuryRecord[]>([])
  const [loading, setLoading]   = useState(true)
  const [showCleared, setShowCleared] = useState(false)

  useEffect(() => {
    if (!session) return
    setLoading(true)
    fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/coach-actions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_injuries' }),
    }).then(r => r.json()).then(data => {
      setInjuries(Array.isArray(data.injuries) ? data.injuries : [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [session])

  function handleUpdated(id: string, stage: number, status: string) {
    setInjuries(prev => prev.map(inj => inj.id === id ? { ...inj, stage, status } : inj))
  }

  // Build name map from roster
  const nameMap: Record<string, string> = {}
  for (const a of roster) { if (a.user_id) nameMap[a.user_id] = a.name }

  const active  = injuries.filter(i => i.status !== 'cleared')
  const cleared = injuries.filter(i => i.status === 'cleared')

  if (loading) return <Spinner />

  if (injuries.length === 0) {
    return (
      <EmptyState
        icon={ShieldPlus}
        title="No active injuries"
        description="Injuries logged from athlete cards will appear here. Use the Injury button on any athlete card to log a new injury."
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* Stage reference */}
      <SectionCard title="Return-to-Mat Protocol">
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          {Object.entries(STAGE_LABELS).map(([stage, info]) => (
            <div key={stage} className="text-center">
              <p className={cn('text-[10px] font-bold', info.color)}>Stage {stage}</p>
              <p className="text-[10px] text-charcoal-light leading-snug">{info.name}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Active injuries */}
      {active.length > 0 && (
        <div className="space-y-3">
          <p className="text-xs font-bold text-charcoal uppercase tracking-wide flex items-center gap-2">
            <Syringe size={13} className="text-red-tier" /> Active ({active.length})
          </p>
          {active.map(inj => (
            <InjuryCard key={inj.id} injury={inj}
              athleteName={nameMap[inj.athlete_user_id] ?? 'Athlete'}
              session={session} onUpdated={handleUpdated} />
          ))}
        </div>
      )}

      {/* Cleared injuries toggle */}
      {cleared.length > 0 && (
        <div>
          <button onClick={() => setShowCleared(o => !o)}
            className="text-xs text-charcoal-light hover:text-charcoal flex items-center gap-1.5 transition-colors">
            <ChevronRight size={12} className={cn('transition-transform', showCleared && 'rotate-90')} />
            {showCleared ? 'Hide' : 'Show'} cleared injuries ({cleared.length})
          </button>
          {showCleared && (
            <div className="mt-3 space-y-3">
              {cleared.map(inj => (
                <InjuryCard key={inj.id} injury={inj}
                  athleteName={nameMap[inj.athlete_user_id] ?? 'Athlete'}
                  session={session} onUpdated={handleUpdated} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function CoachDashboard({ defaultSection = 'team' }: { defaultSection?: Tab }) {
  const { session, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [teamSubTab, setTeamSubTab] = useState<TeamSubTab>('roster')
  const [coachSubTab, setCoachSubTab] = useState<CoachingSubTab>('technique')

  // When navigated to coaching tab with a pending journal log (from Add to Journal)
  const pendingFromRoute = (location.state as { pendingLog?: { code: string; name: string; type: string; notes: string } } | null)?.pendingLog
  const [roster, setRoster] = useState<AthleteRosterItem[]>([])
  const [rosterLoading, setRosterLoading] = useState(true)
  const [coachId, setCoachId] = useState<string | null>(null)
  const [drillCounts, setDrillCounts]       = useState<Record<string, number>>({})
  const [protocolCounts, setProtocolCounts] = useState<Record<string, number>>({})
  const [noteMap, setNoteMap]               = useState<Record<string, string>>({})

  // Lifted coaching tab state (persists across tab switches)
  const [coachingTechs, setCoachingTechs]         = useState<TechniqueItem[]>([])
  const [coachingLoadingTechs, setCoachingLoadingTechs] = useState(true)
  const [selectedCode, setSelectedCode]           = useState('')
  const [warmup, setWarmup]                       = useState<TechniqueWarmup | null>(null)
  // pendingJournalLog comes from route state when navigating from Add to Journal
  const pendingJournalLog = pendingFromRoute ?? null

  // Load coach row
  useEffect(() => {
    if (!user) return
    supabase.from('coaches').select('id').eq('user_id', user.id).single().then(({ data }) => { if (data) setCoachId(data.id) })
  }, [user])

  // Load roster
  useEffect(() => {
    if (!session) return
    setRosterLoading(true)
    fetch(COACH_ROSTER_URL, {
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY },
    }).then(r => r.json()).then(data => setRoster(Array.isArray(data) ? data : data.athletes ?? [])).catch(() => setRoster([])).finally(() => setRosterLoading(false))
  }, [session])

  // Load coaching techniques once (persisted)
  useEffect(() => {
    if (!session || coachingTechs.length > 0) return
    setCoachingLoadingTechs(true)
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'list_techniques' }),
    }).then(r => r.json()).then(data => setCoachingTechs(Array.isArray(data.techniques) ? data.techniques : [])).catch(() => {}).finally(() => setCoachingLoadingTechs(false))
  }, [session, coachingTechs.length])

  // Drill counts
  useEffect(() => {
    if (roster.length === 0) return
    const userIds = roster.map(a => a.user_id).filter(Boolean) as string[]
    if (userIds.length === 0) return
    async function load() {
      const counts: Record<string, number> = {}
      await Promise.all(userIds.map(async uid => {
        const { count } = await supabase.from('drill_sessions').select('*', { count: 'exact', head: true }).eq('user_id', uid)
        counts[uid] = count ?? 0
      }))
      setDrillCounts(counts)
    }
    load()
  }, [roster])

  // Protocol counts via admin edge function (bypasses RLS reliably)
  useEffect(() => {
    if (!session || roster.length === 0) return
    const userIds = roster.map(a => a.user_id).filter(Boolean) as string[]
    if (userIds.length === 0) return
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_protocol_counts', athlete_user_ids: userIds }),
    }).then(r => r.json()).then(data => setProtocolCounts(data.counts ?? {})).catch(() => {})
  }, [session, roster])

  // Load all coach notes for display on cards
  useEffect(() => {
    if (!session) return
    fetch(COACH_ACTIONS_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'get_notes' }),
    }).then(r => r.json()).then(data => {
      const map: Record<string, string> = {}
      for (const n of data.notes ?? []) { if (n.athlete_id && n.note) map[n.athlete_id] = n.note }
      setNoteMap(map)
    }).catch(() => {})
  }, [session])

  function handleNoteUpdated(athleteId: string, note: string) {
    setNoteMap(prev => ({ ...prev, [athleteId]: note }))
  }

  function handleAddToJournal(code: string, name: string, type: string, notes: string) {
    navigate('/dashboard/coach-coaching', { state: { pendingLog: { code, name, type, notes } } })
  }

  // Auto-switch to journal sub-tab if we arrived here via Add to Journal
  useEffect(() => {
    if (defaultSection === 'coaching' && pendingFromRoute) {
      setCoachSubTab('journal')
    }
  }, [defaultSection, pendingFromRoute])

  const sectionTitle = {
    team: `My Team${!rosterLoading ? ` — ${roster.length} athlete${roster.length !== 1 ? 's' : ''}` : ''}`,
    coaching: 'My Coaching',
    competitions: 'My Competitions',
    injury: 'My Injury',
    school: 'My School',
  }[defaultSection] ?? 'Coach Dashboard'

  return (
    <div className="space-y-5">
      <PageHeader title={sectionTitle} subtitle="" />

      {/* MY TEAM ─ Roster + Notes sub-tabs */}
      {defaultSection === 'team' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-surface rounded-xl p-1 w-fit">
            {(['roster', 'notes'] as TeamSubTab[]).map(s => (
              <button key={s} onClick={() => setTeamSubTab(s)}
                className={cn('px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                  teamSubTab === s ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal-light hover:text-charcoal')}>
                {s === 'roster' ? 'Roster' : 'Notes'}
              </button>
            ))}
          </div>
          {teamSubTab === 'roster' && (
            <RosterTab roster={roster} setRoster={setRoster} loading={rosterLoading} session={session} coachId={coachId}
              drillCounts={drillCounts} protocolCounts={protocolCounts} noteMap={noteMap} onNoteUpdated={handleNoteUpdated} />
          )}
          {teamSubTab === 'notes' && <NotesTab roster={roster} session={session} />}
        </div>
      )}

      {/* MY COACHING ─ Technique + Journal sub-tabs */}
      {defaultSection === 'coaching' && (
        <div className="space-y-4">
          <div className="flex gap-1 bg-surface rounded-xl p-1 w-fit">
            {(['technique', 'journal'] as CoachingSubTab[]).map(s => (
              <button key={s} onClick={() => setCoachSubTab(s)}
                className={cn('px-4 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                  coachSubTab === s ? 'bg-white text-charcoal shadow-sm' : 'text-charcoal-light hover:text-charcoal')}>
                {s === 'technique' ? 'Technique' : 'Journal'}
              </button>
            ))}
          </div>
          {coachSubTab === 'technique' && (
            <WarmupTab session={session} techniques={coachingTechs} loadingTechs={coachingLoadingTechs}
              selectedCode={selectedCode} setSelectedCode={setSelectedCode} warmup={warmup} setWarmup={setWarmup}
              onAddToJournal={handleAddToJournal} />
          )}
          {coachSubTab === 'journal' && (
            <JournalTab session={session} pendingLog={pendingJournalLog ?? null} />
          )}
        </div>
      )}

      {/* MY COMPETITIONS ─ In Development */}
      {defaultSection === 'competitions' && (
        <InDevelopmentTab
          title="My Competitions"
          description="Competition prep management is coming. You will be able to manage your athletes' competition calendars, track prep progress, and generate competition readiness scores."
          features={[
            'Competition calendar (coach-managed)',
            '8-week periodized prep countdown',
            'Weight class and cut tracking',
            'Competition readiness composite score (ROM + injury + training load)',
            'Pre-competition ROM clearance signal',
            'Day-of RAMP warmup protocol per athlete',
          ]}
        />
      )}

      {/* MY INJURY ─ Return-to-mat tracker */}
      {defaultSection === 'injury' && (
        <MyInjuryTab session={session} roster={roster} />
      )}

      {/* MY SCHOOL ─ In Development */}
      {defaultSection === 'school' && (
        <InDevelopmentTab
          title="My School"
          description="Administrative school connectivity is coming. Link your gym, manage athletes, and view school-wide performance data."
          features={[
            'Gym / school profile management',
            'Athlete invite and onboarding system',
            'School-wide ROM stats and trends',
            'Multi-coach support',
            'Coach profile and credentials',
          ]}
        />
      )}
    </div>
  )
}
