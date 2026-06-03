import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import { EmptyState } from '../components/EmptyState'
import { Spinner } from '../components/Spinner'
import { cn } from '../lib/utils'
import {
  UserCheck, UserX, CheckCircle2, Circle, ChevronDown, ChevronUp,
  ExternalLink, Calendar, Loader2, Activity,
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────────
interface CoachInfo {
  id: string
  full_name: string | null
  email: string
}

interface Assignment {
  id: string
  technique_name: string
  category: string
  assigned_at: string
  coach_note: string | null
  is_completed: boolean
}

interface VideoFeedback {
  id: string
  title: string
  notes: string | null
  youtube_url: string
  created_at: string
}

interface ProtocolSession {
  id: string
  session_date: string
  protocol_day: string
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function CategoryPill({ category }: { category: string }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide bg-teal-light text-teal px-2 py-0.5 rounded-full">
      {category}
    </span>
  )
}

// ── Section A: Coach Connection ────────────────────────────────────────────────
function CoachConnectionSection({
  userId,
  currentCoach,
  onCoachChange,
}: {
  userId: string
  currentCoach: CoachInfo | null
  onCoachChange: (coach: CoachInfo | null) => void
}) {
  const [email, setEmail] = useState('')
  const [searching, setSearching] = useState(false)
  const [pendingCoach, setPendingCoach] = useState<CoachInfo | null>(null)
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [disconnecting, setDisconnecting] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleSearch() {
    if (!email.trim()) return
    setSearching(true)
    setMsg(null)
    const { data, error } = await supabase.rpc('find_coach_by_email', { p_email: email.trim() })
    setSearching(false)
    if (error || !data || !data.coach_id) {
      const reason = data?.reason
      setMsg({
        type: 'err',
        text: reason === 'coach_row_missing'
          ? 'Coach account found but not fully set up. Ask them to complete signup at romrxbodybuilding.com/signup/coach.'
          : 'No coach account found with that email. Ask them to sign up at romrxbodybuilding.com/signup/coach.',
      })
      return
    }
    setPendingCoach({ id: data.coach_id, full_name: data.full_name, email: data.email })
  }

  async function handleConfirm() {
    if (!pendingCoach) return
    setConfirming(true)
    await supabase.from('athletes').update({ coach_id: pendingCoach.id }).eq('user_id', userId)
    setConfirming(false)
    onCoachChange(pendingCoach)
    setPendingCoach(null)
    setEmail('')
    setMsg({ type: 'ok', text: 'Coach connected successfully.' })
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    await supabase.from('athletes').update({ coach_id: null }).eq('user_id', userId)
    setDisconnecting(false)
    onCoachChange(null)
    setMsg(null)
  }

  if (currentCoach) {
    return (
      <SectionCard title="My Coach">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-teal-light flex items-center justify-center shrink-0">
              <UserCheck size={18} className="text-teal" />
            </div>
            <div>
              <p className="text-sm font-bold text-charcoal">{currentCoach.full_name ?? 'Coach'}</p>
              <p className="text-xs text-charcoal-light">{currentCoach.email}</p>
            </div>
          </div>
          <button
            onClick={handleDisconnect}
            disabled={disconnecting}
            className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl transition-colors"
          >
            <UserX size={13} />
            {disconnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        </div>
        {msg && (
          <p className={cn('text-xs mt-2', msg.type === 'ok' ? 'text-green-600' : 'text-red-600')}>{msg.text}</p>
        )}
      </SectionCard>
    )
  }

  return (
    <SectionCard title="My Coach">
      <p className="text-sm text-charcoal-light mb-4">
        Connect to your coach by email. They will be able to see your ROM data, assign drills, and track your training.
      </p>

      {/* Search form */}
      {!pendingCoach && (
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="coach@example.com"
            className="flex-1 text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors"
          />
          <button
            onClick={handleSearch}
            disabled={searching || !email.trim()}
            className="btn-primary flex items-center gap-1.5 text-sm px-4 py-2 disabled:opacity-50"
          >
            {searching ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
            Find Coach
          </button>
        </div>
      )}

      {/* Consent banner */}
      {pendingCoach && (
        <div className="rounded-2xl border-2 border-teal bg-teal/5 p-4 space-y-3">
          <p className="text-sm font-semibold text-charcoal">Connect to {pendingCoach.full_name ?? pendingCoach.email}?</p>
          <p className="text-xs text-charcoal-light leading-relaxed">
            By connecting, your coach will be able to view your full ROM assessment results, joint mobility data,
            and protocol session history. You can disconnect at any time.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleConfirm}
              disabled={confirming}
              className="btn-primary text-sm px-4 py-2 flex items-center gap-1.5"
            >
              {confirming ? 'Connecting...' : 'Yes, connect my coach'}
            </button>
            <button
              onClick={() => setPendingCoach(null)}
              className="text-sm text-charcoal-light hover:text-charcoal px-3 py-2 rounded-xl transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && (
        <p className={cn('text-xs mt-2', msg.type === 'ok' ? 'text-green-600' : 'text-red-600')}>{msg.text}</p>
      )}

      <p className="text-xs text-charcoal-light mt-3">
        Your coach must have a ROMRx Coach account.{' '}
        <a href="/signup/coach" className="text-teal hover:underline font-medium">
          Send them here to sign up.
        </a>
      </p>
    </SectionCard>
  )
}

// ── Section B: Assignments ─────────────────────────────────────────────────────
function AssignmentsSection({ userId }: { userId: string }) {
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [loading, setLoading] = useState(true)
  const [showCompleted, setShowCompleted] = useState(false)
  const [completing, setCompleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('coach_assignments')
      .select('id, technique_name, category, assigned_at, coach_note, is_completed')
      .eq('athlete_user_id', userId)
      .order('assigned_at', { ascending: false })
    setAssignments((data as Assignment[]) ?? [])
    setLoading(false)
  }, [userId])

  useEffect(() => { load() }, [load])

  async function handleMarkComplete(id: string) {
    setCompleting(id)
    await supabase.from('coach_assignments').update({ is_completed: true }).eq('id', id)
    setAssignments(prev => prev.map(a => a.id === id ? { ...a, is_completed: true } : a))
    setCompleting(null)
  }

  if (loading) return <Spinner />

  const pending = assignments.filter(a => !a.is_completed)
  const completed = assignments.filter(a => a.is_completed)

  if (assignments.length === 0) {
    return (
      <SectionCard title="Coach Assignments">
        <EmptyState
          icon={CheckCircle2}
          title="No assignments yet"
          description="Your coach has not assigned any drills yet. Check back after your next session."
        />
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Coach Assignments">
      <div className="space-y-3">
        {pending.length === 0 && (
          <p className="text-sm text-charcoal-light italic">All caught up. No pending assignments.</p>
        )}
        {pending.map(a => (
          <div key={a.id} className="bg-surface rounded-2xl p-4 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-bold text-charcoal leading-snug">{a.technique_name}</p>
                <div className="flex items-center gap-2 mt-1">
                  <CategoryPill category={a.category} />
                  <span className="text-[10px] text-charcoal-light">{formatDate(a.assigned_at)}</span>
                </div>
              </div>
              <Circle size={16} className="text-charcoal-light shrink-0 mt-0.5" />
            </div>
            {a.coach_note && (
              <p className="text-xs text-charcoal-light bg-white rounded-xl px-3 py-2 border border-teal-light leading-relaxed">
                {a.coach_note}
              </p>
            )}
            <button
              onClick={() => handleMarkComplete(a.id)}
              disabled={completing === a.id}
              className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              <CheckCircle2 size={12} />
              {completing === a.id ? 'Marking...' : 'Mark Complete'}
            </button>
          </div>
        ))}

        {completed.length > 0 && (
          <div>
            <button
              onClick={() => setShowCompleted(o => !o)}
              className="flex items-center gap-1.5 text-xs font-semibold text-charcoal-light hover:text-charcoal transition-colors"
            >
              {showCompleted ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showCompleted ? 'Hide' : 'Show'} completed ({completed.length})
            </button>
            {showCompleted && (
              <div className="mt-2 space-y-2">
                {completed.map(a => (
                  <div key={a.id} className="bg-surface rounded-xl px-4 py-2.5 flex items-center gap-3 opacity-60">
                    <CheckCircle2 size={14} className="text-green-600 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-charcoal line-through truncate">{a.technique_name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <CategoryPill category={a.category} />
                        <span className="text-[10px] text-charcoal-light">{formatDate(a.assigned_at)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ── Section C: Video Feedback ──────────────────────────────────────────────────
function VideoFeedbackSection({ userId }: { userId: string }) {
  const [videos, setVideos] = useState<VideoFeedback[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('coach_video_feedback')
      .select('id, title, notes, youtube_url, created_at')
      .eq('athlete_user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setVideos((data as VideoFeedback[]) ?? [])
        setLoading(false)
      })
  }, [userId])

  if (loading) return <Spinner />

  if (videos.length === 0) {
    return (
      <SectionCard title="Videos from Your Coach">
        <EmptyState
          icon={ExternalLink}
          title="No videos yet"
          description="Your coach has not shared any video feedback yet."
        />
      </SectionCard>
    )
  }

  return (
    <SectionCard title="Videos from Your Coach">
      <div className="space-y-3">
        {videos.map(v => (
          <div key={v.id} className="bg-surface rounded-2xl p-4 space-y-2">
            <p className="text-sm font-bold text-charcoal">{v.title}</p>
            {v.notes && (
              <p className="text-xs text-charcoal-light leading-relaxed">{v.notes}</p>
            )}
            <a
              href={v.youtube_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal hover:underline"
            >
              <ExternalLink size={12} />
              Watch on YouTube
            </a>
            <p className="text-[10px] text-charcoal-light">{formatDate(v.created_at)}</p>
          </div>
        ))}
      </div>
    </SectionCard>
  )
}

// ── Section D: Protocol Activity ───────────────────────────────────────────────
function ProtocolActivitySection({ userId }: { userId: string }) {
  const [sessions, setSessions] = useState<ProtocolSession[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('protocol_sessions')
      .select('id, session_date, protocol_day')
      .eq('user_id', userId)
      .order('session_date', { ascending: false })
      .limit(30)
      .then(({ data }) => {
        setSessions((data as ProtocolSession[]) ?? [])
        setLoading(false)
      })
  }, [userId])

  if (loading) return <Spinner />

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const recentCount = sessions.filter(s => s.session_date >= thirtyDaysAgo).length

  return (
    <SectionCard title="Protocol Activity">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-teal-light flex items-center justify-center shrink-0">
            <Activity size={18} className="text-teal" />
          </div>
          <div>
            <p className="text-2xl font-bold text-charcoal">{recentCount}</p>
            <p className="text-xs text-charcoal-light">sessions in the last 30 days</p>
          </div>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-charcoal-light italic">No sessions logged yet. Complete a protocol session to see your activity here.</p>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-charcoal-light uppercase tracking-wide">Recent sessions</p>
            {sessions.slice(0, 10).map(s => (
              <div key={s.id} className="flex items-center gap-3 bg-surface rounded-xl px-3 py-2">
                <Calendar size={12} className="text-teal shrink-0" />
                <span className="text-xs text-charcoal font-medium">
                  {new Date(s.session_date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                {s.protocol_day && (
                  <span className="text-[10px] bg-teal-light text-teal px-2 py-0.5 rounded-full font-semibold ml-auto">
                    {s.protocol_day}
                  </span>
                )}
              </div>
            ))}
            {sessions.length > 10 && (
              <p className="text-xs text-charcoal-light text-center pt-1">
                Showing 10 most recent of {sessions.length} total sessions
              </p>
            )}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────
export function MyCoach() {
  const { user } = useAuth()
  const [currentCoach, setCurrentCoach] = useState<CoachInfo | null>(null)
  const [coachLoading, setCoachLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    async function loadCoach() {
      setCoachLoading(true)
      const { data: athlete } = await supabase
        .from('athletes')
        .select('coach_id')
        .eq('user_id', user!.id)
        .single()
      if (athlete?.coach_id) {
        const { data: coachData } = await supabase.rpc('get_my_coach')
        if (coachData) {
          setCurrentCoach({ id: coachData.id, full_name: coachData.full_name, email: coachData.email })
        }
      }
      setCoachLoading(false)
    }
    loadCoach()
  }, [user])

  if (!user) return <Spinner />

  return (
    <div className="space-y-5">
      <PageHeader
        title="My Coach"
        subtitle="Connect to your coach and track your assignments"
      />

      {coachLoading ? (
        <Spinner />
      ) : (
        <>
          <CoachConnectionSection
            userId={user.id}
            currentCoach={currentCoach}
            onCoachChange={setCurrentCoach}
          />

          {currentCoach && (
            <>
              <AssignmentsSection userId={user.id} />
              <VideoFeedbackSection userId={user.id} />
              <ProtocolActivitySection userId={user.id} />
            </>
          )}
        </>
      )}
    </div>
  )
}
