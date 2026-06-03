import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import type { Assessment } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import {
  Save, Loader2, ExternalLink, Mail, HelpCircle,
  LogOut, Trash2, ChevronRight, ClipboardList, TrendingUp,
  UserCheck, UserX, School, KeyRound, CheckCircle2, Bell,
} from 'lucide-react'
import { beltColor, cn } from '../lib/utils'

const BELTS = ['white', 'blue', 'purple', 'brown', 'black']
const SIDES = ['right', 'left']

// ── PRS helpers (mirrors MyBody.tsx) ─────────────────────────────────────────
const PRS_BILATERAL = [
  { l: 'hip_er_l',        r: 'hip_er_r',        riskBelow: 40,  normalMin: 40  },
  { l: 'hip_ir_l',        r: 'hip_ir_r',        riskBelow: 30,  normalMin: 30  },
  { l: 'hip_abd_l',       r: 'hip_abd_r',       riskBelow: 30,  normalMin: 40  },
  { l: 'hip_flex_l',      r: 'hip_flex_r',      riskBelow: 100, normalMin: 100 },
  { l: 'shoulder_er_l',   r: 'shoulder_er_r',   riskBelow: 60,  normalMin: 60  },
  { l: 'shoulder_flex_l', r: 'shoulder_flex_r', riskBelow: 120, normalMin: 140 },
  { l: 'ankle_df_l',      r: 'ankle_df_r',      riskBelow: 10,  normalMin: 10  },
  { l: 'cervical_rot_l',  r: 'cervical_rot_r',  riskBelow: 60,  normalMin: 70  },
]
const PRS_UNILATERAL = [
  { key: 'lumbar_flex', riskBelow: 40, normalMin: 40 },
  { key: 'lumbar_ext',  riskBelow: 15, normalMin: 20 },
  { key: 'thoracic_rot',riskBelow: 30, normalMin: 40 },
]

function computePRS(a: Assessment): number {
  let score = 100
  for (const j of PRS_BILATERAL) {
    const l = (a as unknown as Record<string, number | null>)[j.l]
    const r = (a as unknown as Record<string, number | null>)[j.r]
    if (l != null && r != null) {
      const minVal = Math.min(l, r)
      const gap    = Math.abs(l - r)
      if (minVal < j.riskBelow) score -= 8
      else if (minVal < j.normalMin) score -= 4
      if (gap >= 15) score -= 6
      else if (gap >= 8) score -= 3
    }
  }
  for (const j of PRS_UNILATERAL) {
    const v = (a as unknown as Record<string, number | null>)[j.key]
    if (v != null) {
      if (v < j.riskBelow) score -= 6
      else if (v < j.normalMin) score -= 3
    }
  }
  return Math.max(0, Math.min(100, Math.round(score)))
}

function getPRSTier(s: number) {
  if (s >= 85) return { label: 'ELITE',      color: 'text-teal',        bg: 'bg-teal-light' }
  if (s >= 70) return { label: 'STRONG',     color: 'text-teal',        bg: 'bg-teal-light' }
  if (s >= 55) return { label: 'DEVELOPING', color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg' }
  if (s >= 40) return { label: 'RESTRICTED', color: 'text-yellow-tier', bg: 'bg-yellow-tier-bg' }
  return              { label: 'AT RISK',    color: 'text-red-tier',    bg: 'bg-red-tier-bg' }
}

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({
  title, icon, children,
}: {
  title: string
  icon?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-2">
        {icon && <span className="text-charcoal-light">{icon}</span>}
        <h2 className="text-xs font-bold text-charcoal uppercase tracking-widest">{title}</h2>
      </div>
      {children}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
import { CoachSettings } from './CoachSettings'

// Router: coaches get CoachSettings, athletes get AthleteSettings
// MUST be a separate component so hook call order is never violated
export function Settings() {
  const { user } = useAuth()
  const isCoach = user?.user_metadata?.portal_role === 'coach' ||
                  (user?.app_metadata as Record<string,string> | undefined)?.portal_role === 'coach'
  if (isCoach) return <CoachSettings />
  return <AthleteSettings />
}

function AthleteSettings() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { profile, assessment, loading } = useProfile(user?.id)

  // ── Profile fields ──
  const [fullName, setFullName]         = useState('')
  const [belt, setBelt]                 = useState('')
  const [originalBelt, setOriginalBelt] = useState('')
  const [dominantSide, setDominantSide] = useState('right')
  const [saving, setSaving]             = useState(false)
  const [saved, setSaved]               = useState(false)
  const [saveErr, setSaveErr]           = useState<string | null>(null)
  const [recomputing, setRecomputing]   = useState(false)

  // ── Gym connection ──
  const [gymName, setGymName]     = useState('')
  const [gymSaving, setGymSaving] = useState(false)
  const [gymSaved, setGymSaved]   = useState(false)
  const [gymErr, setGymErr]       = useState<string | null>(null)

  // ── Coach connection ──
  const [coachEmail, setCoachEmail]         = useState('')
  const [currentCoach, setCurrentCoach]     = useState<{ id: string; full_name: string | null; email: string } | null>(null)
  const [coachLoading, setCoachLoading]     = useState(false)
  const [coachSearching, setCoachSearching] = useState(false)
  const [coachMsg, setCoachMsg]             = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [pendingCoach, setPendingCoach]     = useState<{ id: string; full_name: string | null; email: string } | null>(null)

  // ── Subscription ──
  const [subExpiry, setSubExpiry]         = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  // ── Assessment history ──
  const [assessments, setAssessments] = useState<Assessment[]>([])
  const [asLoading, setAsLoading]     = useState(true)

  // ── Password reset ──
  const [newPassword, setNewPassword]     = useState('')
  const [confirmPw, setConfirmPw]         = useState('')
  const [pwSaving, setPwSaving]           = useState(false)
  const [pwMsg, setPwMsg]                 = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // ── Notification preferences ──
  const [notifLoading, setNotifLoading]       = useState(false)
  const [notifSaving, setNotifSaving]         = useState(false)
  const [notifSaved, setNotifSaved]           = useState(false)
  const [notifErr, setNotifErr]               = useState<string | null>(null)
  const [emailReminders, setEmailReminders]   = useState(false)
  const [pushReminders, setPushReminders]     = useState(false)
  const [reminderTime, setReminderTime]       = useState('08:00')
  const [pushLoading, setPushLoading]         = useState(false)
  const [pushMsg, setPushMsg]                 = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const browserTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone

  // ── Delete modal ──
  const [showDelete, setShowDelete] = useState(false)
  const [deleteText, setDeleteText] = useState('')
  const [deleting, setDeleting]     = useState(false)

  // ── Sync profile → local state ──
  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name ?? '')
      const b = profile.belt ?? 'white'
      setBelt(b)
      setOriginalBelt(b)
    }
  }, [profile])

  // ── Load athlete data + sub expiry + assessments ──
  useEffect(() => {
    if (!user) return
    async function loadData() {
      // Athlete row
      const { data: athlete } = await supabase
        .from('athletes')
        .select('dominant_side, gym_name, coach_id')
        .eq('user_id', user!.id)
        .single()
      if (athlete) {
        setDominantSide(athlete.dominant_side ?? 'right')
        setGymName(athlete.gym_name ?? '')

        // Load linked coach via SECURITY DEFINER RPC (bypasses RLS on users table)
        if (athlete.coach_id) {
          setCoachLoading(true)
          const { data: coachData } = await supabase.rpc('get_my_coach')
          if (coachData) setCurrentCoach({ id: coachData.id, full_name: coachData.full_name, email: coachData.email })
          setCoachLoading(false)
        }
      }

      // Subscription expiry
      const { data: userData } = await supabase
        .from('users')
        .select('subscription_expiry')
        .eq('id', user!.id)
        .single()
      if (userData?.subscription_expiry) setSubExpiry(userData.subscription_expiry)

      // All assessments newest-first
      setAsLoading(true)
      const { data: asmts } = await supabase
        .from('assessments')
        .select('*')
        .eq('user_id', user!.id)
        .order('assessed_at', { ascending: false })
      setAssessments((asmts as Assessment[]) ?? [])
      setAsLoading(false)
    }
    loadData()
  }, [user])

  // ── Load notification preferences on mount ──
  useEffect(() => {
    if (!user) return
    async function loadNotifPrefs() {
      setNotifLoading(true)
      const { data } = await supabase
        .from('notification_preferences')
        .select('email_reminders, push_reminders, reminder_time, timezone')
        .eq('user_id', user!.id)
        .maybeSingle()
      if (data) {
        setEmailReminders(data.email_reminders ?? false)
        setPushReminders(data.push_reminders ?? false)
        setReminderTime(data.reminder_time ?? '08:00')
      } else {
        // First load — upsert defaults
        await supabase.from('notification_preferences').upsert(
          {
            user_id: user!.id,
            email_reminders: false,
            push_reminders: false,
            reminder_time: '08:00',
            timezone: browserTimezone,
          },
          { onConflict: 'user_id' }
        )
      }
      setNotifLoading(false)
    }
    loadNotifPrefs()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  // ── Save notification settings ──
  const handleSaveNotifications = async () => {
    if (!user) return
    setNotifSaving(true)
    setNotifErr(null)
    const { error } = await supabase
      .from('notification_preferences')
      .upsert(
        {
          user_id: user.id,
          email_reminders: emailReminders,
          push_reminders: pushReminders,
          reminder_time: reminderTime,
          timezone: browserTimezone,
        },
        { onConflict: 'user_id' }
      )
    setNotifSaving(false)
    if (error) {
      setNotifErr(error.message)
    } else {
      setNotifSaved(true)
      setTimeout(() => setNotifSaved(false), 2500)
    }
  }

  // ── Enable push notifications ──
  const handleEnablePush = async () => {
    if (!user) return
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushMsg({ type: 'err', text: 'Push notifications are not supported in this browser.' })
      return
    }
    setPushLoading(true)
    setPushMsg(null)
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setPushMsg({ type: 'err', text: 'Notification permission denied.' })
        setPushLoading(false)
        return
      }
      const registration = await navigator.serviceWorker.ready
      // VAPID public key — replace with your actual key from vapidkeys.com
      const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY ?? ''
      if (!VAPID_PUBLIC_KEY) {
        setPushMsg({ type: 'err', text: 'VAPID public key not configured. Set VITE_VAPID_PUBLIC_KEY in .env.' })
        setPushLoading(false)
        return
      }
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: VAPID_PUBLIC_KEY,
      })
      const { error } = await supabase.functions.invoke('save-push-subscription', {
        body: { subscription: subscription.toJSON() },
      })
      if (error) throw error
      setPushReminders(true)
      setPushMsg({ type: 'ok', text: 'Push notifications enabled!' })
      setTimeout(() => setPushMsg(null), 4000)
    } catch (err) {
      setPushMsg({ type: 'err', text: String(err) })
    } finally {
      setPushLoading(false)
    }
  }

  // ── Save profile (SECURITY DEFINER RPC — bypasses RLS) ──
  const handleSaveProfile = async () => {
    if (!user) return
    setSaving(true)
    setSaveErr(null)
    const { data, error } = await supabase.rpc('save_my_profile', {
      p_full_name:     fullName,
      p_belt:          belt,
      p_dominant_side: dominantSide,
    })
    setSaving(false)
    if (error || data?.ok === false) {
      setSaveErr(error?.message ?? data?.error ?? 'Save failed. Try again.')
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)

    // Belt changed + user has an assessment — recompute technique eligibility
    if (belt !== originalBelt && assessment) {
      setRecomputing(true)
      try {
        await supabase.functions.invoke('compute-tiers', {
          body: { record: assessment },
        })
      } catch (e) {
        console.error('Recompute error', e)
      } finally {
        setRecomputing(false)
        setOriginalBelt(belt)
      }
    } else {
      setOriginalBelt(belt)
    }
  }

  // ── Save gym (SECURITY DEFINER RPC) ──
  const handleSaveGym = async () => {
    if (!user) return
    setGymSaving(true)
    setGymErr(null)
    const { data, error } = await supabase.rpc('save_my_gym', { p_gym_name: gymName })
    setGymSaving(false)
    if (error || data?.ok === false) {
      setGymErr(error?.message ?? data?.error ?? 'Save failed. Try again.')
      return
    }
    setGymSaved(true)
    setTimeout(() => setGymSaved(false), 2500)
  }

  // ── Connect coach by email ──
  const handleConnectCoach = async () => {
    if (!user || !coachEmail.trim()) return
    setCoachSearching(true)
    setCoachMsg(null)
    // SECURITY DEFINER RPC bypasses RLS so athletes can look up coach emails
    const { data, error } = await supabase.rpc('find_coach_by_email', { p_email: coachEmail.trim() })
    if (error || !data?.found) {
      const msg = data?.reason === 'coach_row_missing'
        ? 'Coach account found but not fully set up. Ask them to complete their signup at romrxbodybuilding.com/signup/coach.'
        : 'No coach account found with that email. Ask them to sign up at romrxbodybuilding.com/signup/coach.'
      setCoachMsg({ type: 'err', text: msg })
      setCoachSearching(false)
      return
    }
    // Show consent confirmation before saving
    setPendingCoach({ id: data.coach_id, full_name: data.full_name, email: data.email })
    setCoachSearching(false)
  }

  // ── Confirm coach connection after consent ──
  const handleConfirmCoach = async () => {
    if (!user || !pendingCoach) return
    await supabase.from('athletes').update({ coach_id: pendingCoach.id }).eq('user_id', user.id)
    setCurrentCoach(pendingCoach)
    setPendingCoach(null)
    setCoachEmail('')
    setCoachMsg({ type: 'ok', text: `Connected to ${pendingCoach.full_name ?? pendingCoach.email}.` })
    setTimeout(() => setCoachMsg(null), 4000)
  }

  // ── Disconnect coach ──
  const handleDisconnectCoach = async () => {
    if (!user) return
    await supabase.from('athletes').update({ coach_id: null }).eq('user_id', user.id)
    setCurrentCoach(null)
    setCoachMsg({ type: 'ok', text: 'Coach disconnected.' })
    setTimeout(() => setCoachMsg(null), 3000)
  }

  // ── Stripe portal ──
  const handleManageSub = async () => {
    setPortalLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {
        body: { return_url: window.location.href },
      })
      if (error) throw error
      if (data?.url) window.location.href = data.url
    } catch (e) {
      console.error('Stripe portal error', e)
    } finally {
      setPortalLoading(false)
    }
  }

  // ── Change password ──
  const handleChangePassword = async () => {
    setPwMsg(null)
    if (!newPassword || newPassword.length < 8) {
      setPwMsg({ type: 'err', text: 'Password must be at least 8 characters.' })
      return
    }
    if (newPassword !== confirmPw) {
      setPwMsg({ type: 'err', text: 'Passwords do not match.' })
      return
    }
    setPwSaving(true)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    setPwSaving(false)
    if (error) {
      setPwMsg({ type: 'err', text: error.message })
    } else {
      setNewPassword('')
      setConfirmPw('')
      setPwMsg({ type: 'ok', text: 'Password updated.' })
      setTimeout(() => setPwMsg(null), 4000)
    }
  }

  // ── Sign out ──
  const handleSignOut = async () => {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // ── Delete account ──
  const handleDelete = async () => {
    if (!user || deleteText !== 'DELETE') return
    setDeleting(true)
    try {
      await supabase.from('athletes').delete().eq('user_id', user.id)
      await supabase.from('users').update({ subscription_status: 'canceled' }).eq('id', user.id)
      await supabase.auth.signOut()
      navigate('/login')
    } catch (e) {
      console.error('Delete error', e)
      setDeleting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const isActive = ['active', 'trialing'].includes(profile?.subscription_status ?? '')

  return (
    <>
      <div className="max-w-lg space-y-5 pb-16">
        <h1 className="font-display font-bold text-2xl text-charcoal">Settings</h1>

        {/* ── PROFILE ── */}
        <Section title="Profile">
          <div>
            <label className="text-xs text-charcoal-light font-semibold uppercase tracking-wide block mb-1">
              Full Name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-xl border border-teal-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>

          <div>
            <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-1">Email</p>
            <p className="text-sm text-charcoal">{profile?.email ?? user?.email}</p>
          </div>

          <div>
            <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-2">Belt</p>
            <div className="flex gap-2 flex-wrap">
              {BELTS.map(b => (
                <button
                  key={b}
                  onClick={() => { if (!currentCoach) setBelt(b) }}
                  disabled={!!currentCoach}
                  className={cn(
                    'px-3 py-1.5 rounded-full text-xs font-bold uppercase transition-all',
                    currentCoach ? 'opacity-50 cursor-not-allowed' : '',
                    belt === b
                      ? beltColor(b) + ' ring-2 ring-offset-1 ring-teal'
                      : beltColor(b) + ' opacity-50 hover:opacity-80'
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
            {currentCoach && (
              <p className="text-xs text-charcoal-light mt-2">
                Your coach manages your belt. {currentCoach.full_name ?? currentCoach.email} can promote you from the team dashboard.
              </p>
            )}
          </div>

          <div>
            <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide mb-2">
              Dominant Side
            </p>
            <div className="flex gap-2">
              {SIDES.map(s => (
                <button
                  key={s}
                  onClick={() => setDominantSide(s)}
                  className={cn(
                    'px-4 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors',
                    dominantSide === s
                      ? 'bg-teal text-white'
                      : 'bg-surface text-charcoal-light border border-teal-light hover:bg-teal-light'
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {saveErr && (
            <p className="text-xs text-red-tier font-medium">{saveErr}</p>
          )}
          {recomputing && (
            <div className="flex items-center gap-2 text-xs text-charcoal-light">
              <Loader2 size={12} className="animate-spin text-teal" />
              Updating technique library for your new belt...
            </div>
          )}
          <button
            onClick={handleSaveProfile}
            disabled={saving || recomputing}
            className="btn-primary flex items-center gap-2"
          >
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {saved ? 'Saved!' : 'Save Profile'}
          </button>
        </Section>

        {/* ── GYM CONNECTION ── */}
        <Section title="My Gym" icon={<School size={14} />}>
          <p className="text-xs text-charcoal-light -mt-2">
            Enter your gym or academy name. This is independent of your coach.
          </p>

          <div>
            <label className="text-xs text-charcoal-light font-semibold uppercase tracking-wide block mb-1">
              Gym / Academy Name
            </label>
            <input
              type="text"
              value={gymName}
              onChange={e => setGymName(e.target.value)}
              placeholder="e.g. Alliance BJJ Columbus"
              className="w-full rounded-xl border border-teal-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal"
            />
          </div>

          {gymErr && (
            <p className="text-xs text-red-tier font-medium">{gymErr}</p>
          )}
          <button
            onClick={handleSaveGym}
            disabled={gymSaving}
            className="btn-primary flex items-center gap-2"
          >
            {gymSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            {gymSaved ? 'Saved!' : 'Save Gym'}
          </button>
        </Section>

        {/* ── COACH CONNECTION ── */}
        <Section title="My Coach" icon={<UserCheck size={14} />}>
          <p className="text-xs text-charcoal-light -mt-2">
            Link to your coach directly by their email. Your coach does not need to be at the same gym.
          </p>

          {/* Connected coach card */}
          {coachLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 size={14} className="animate-spin text-teal" />
              <span className="text-sm text-charcoal-light">Loading...</span>
            </div>
          ) : currentCoach ? (
            <div className="flex items-center justify-between rounded-xl bg-teal-light border border-teal/20 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-charcoal">
                  {currentCoach.full_name ?? currentCoach.email}
                </p>
                <p className="text-xs text-charcoal-light mt-0.5">{currentCoach.email}</p>
              </div>
              <button
                onClick={handleDisconnectCoach}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-tier hover:underline"
              >
                <UserX size={13} />
                Remove
              </button>
            </div>
          ) : (
            <p className="text-sm text-charcoal-light italic">No coach connected yet.</p>
          )}

          {/* Pending coach consent banner */}
          {pendingCoach && (
            <div className="space-y-3 bg-teal-light border border-teal/20 rounded-xl px-4 py-3">
              <p className="text-sm text-charcoal leading-snug">
                Connecting to <span className="font-semibold">{pendingCoach.full_name ?? pendingCoach.email}</span> will allow them to view your full ROM data, technique readiness, and training history. Continue?
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleConfirmCoach}
                  className="btn-primary text-xs px-4 py-2"
                >
                  Yes, connect
                </button>
                <button
                  onClick={() => setPendingCoach(null)}
                  className="text-xs px-4 py-2 rounded-xl border border-teal-light text-charcoal-light hover:bg-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Connect by email */}
          {!currentCoach && !pendingCoach && (
            <div className="space-y-2">
              <label className="text-xs text-charcoal-light font-semibold uppercase tracking-wide block">
                Connect by Coach Email
              </label>
              <div className="flex gap-2">
                <input
                  type="email"
                  value={coachEmail}
                  onChange={e => setCoachEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleConnectCoach()}
                  placeholder="coach@example.com"
                  className="flex-1 rounded-xl border border-teal-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal"
                />
                <button
                  onClick={handleConnectCoach}
                  disabled={coachSearching || !coachEmail.trim()}
                  className="btn-primary flex items-center gap-1.5 whitespace-nowrap disabled:opacity-50"
                >
                  {coachSearching ? <Loader2 size={14} className="animate-spin" /> : <UserCheck size={14} />}
                  Connect
                </button>
              </div>
              <p className="text-xs text-charcoal-light">
                Your coach must have a ROMRx Coach account. Send them to{' '}
                <a href="/signup/coach" className="text-teal hover:underline font-medium">
                  romrxbodybuilding.com/signup/coach
                </a>
              </p>
            </div>
          )}

          {/* Message */}
          {coachMsg && (
            <div className={cn(
              'flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium',
              coachMsg.type === 'ok'
                ? 'bg-teal-light text-teal'
                : 'bg-red-tier-bg text-red-tier'
            )}>
              {coachMsg.type === 'ok'
                ? <CheckCircle2 size={14} />
                : <span className="text-xs font-bold">!</span>
              }
              {coachMsg.text}
            </div>
          )}
        </Section>

        {/* ── SUBSCRIPTION ── */}
        <Section title="Subscription">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-charcoal-light">Plan</p>
              <span className="text-xs bg-teal-light text-teal font-semibold px-3 py-1 rounded-full capitalize">
                {profile?.subscription_tier ?? 'free'}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-sm text-charcoal-light">Status</p>
              <span className={cn(
                'text-xs font-semibold px-3 py-1 rounded-full capitalize',
                isActive
                  ? 'bg-green-tier-bg text-green-tier'
                  : 'bg-red-tier-bg text-red-tier'
              )}>
                {profile?.subscription_status ?? 'inactive'}
              </span>
            </div>

            {subExpiry && (
              <div className="flex items-center justify-between">
                <p className="text-sm text-charcoal-light">Renews</p>
                <p className="text-sm font-medium text-charcoal">
                  {new Date(subExpiry).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric',
                  })}
                </p>
              </div>
            )}
          </div>

          {isActive && (
            <button
              onClick={handleManageSub}
              disabled={portalLoading}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-surface border border-teal-light text-sm font-medium text-charcoal hover:bg-teal-light transition-colors"
            >
              <span>Manage Subscription</span>
              {portalLoading
                ? <Loader2 size={15} className="animate-spin text-teal" />
                : <ExternalLink size={15} className="text-charcoal-light" />
              }
            </button>
          )}
        </Section>

        {/* ── ASSESSMENT HISTORY ── */}
        <Section title="Assessment History">
          <div className="flex items-center justify-between -mt-2 mb-1">
            <p className="text-xs text-charcoal-light">Your past ROM snapshots</p>
            <a href="/onboarding/assessment" className="text-xs font-semibold text-teal hover:underline">
              + New Assessment
            </a>
          </div>

          {asLoading ? (
            <div className="flex justify-center py-6">
              <div className="w-5 h-5 border-2 border-teal border-t-transparent rounded-full animate-spin" />
            </div>
          ) : assessments.length === 0 ? (
            <div className="text-center py-6">
              <ClipboardList size={28} className="mx-auto text-charcoal-light mb-2" />
              <p className="text-sm text-charcoal-light mb-2">No assessments on file yet.</p>
              <a href="/onboarding/assessment" className="inline-block text-sm font-semibold text-teal hover:underline">
                Take your first assessment
              </a>
            </div>
          ) : (
            <div className="divide-y divide-teal-light/60">
              {assessments.map((a, i) => {
                const prs  = computePRS(a)
                const tier = getPRSTier(prs)
                return (
                  <div key={a.id} className="flex items-center justify-between py-3 first:pt-0 last:pb-0">
                    <div className="flex items-center gap-3">
                      <div className={cn('w-10 h-10 rounded-full flex flex-col items-center justify-center shrink-0', tier.bg)}>
                        <span className={cn('font-display font-bold text-sm leading-none', tier.color)}>{prs}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-charcoal">
                          {new Date(a.assessed_at).toLocaleDateString('en-US', {
                            month: 'short', day: 'numeric', year: 'numeric',
                          })}
                        </p>
                        <p className={cn('text-xs font-bold', tier.color)}>{tier.label}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      {i === 0 && (
                        <span className="text-xs bg-teal-light text-teal px-2 py-0.5 rounded-full font-semibold">
                          Latest
                        </span>
                      )}
                      <a
                        href="/onboarding/assessment"
                        className="flex items-center gap-1 text-xs font-semibold text-teal hover:underline"
                      >
                        <TrendingUp size={12} />
                        Retest
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </Section>

        {/* ── SUPPORT ── */}
        <Section title="Support">
          <div className="space-y-2 -mt-1">
            <a
              href="mailto:ROMRxBB@gmail.com"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-teal-light text-sm font-medium text-charcoal hover:bg-teal-light transition-colors"
            >
              <Mail size={15} className="text-teal shrink-0" />
              <span className="flex-1">
                Email us
                <span className="block text-xs text-charcoal-light font-normal mt-0.5">ROMRxBB@gmail.com</span>
              </span>
              <ChevronRight size={14} className="text-charcoal-light" />
            </a>
            <a
              href="mailto:ROMRxBB@gmail.com?subject=ROMRxBB%20Question"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-teal-light text-sm font-medium text-charcoal hover:bg-teal-light transition-colors"
            >
              <HelpCircle size={15} className="text-teal shrink-0" />
              <span className="flex-1">Questions and FAQ</span>
              <ChevronRight size={14} className="text-charcoal-light" />
            </a>
            <a
              href="/legal"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-teal-light text-sm font-medium text-charcoal hover:bg-teal-light transition-colors"
            >
              <ExternalLink size={15} className="text-teal shrink-0" />
              <span className="flex-1">
                Terms of Service &amp; Privacy Policy
                <span className="block text-xs text-charcoal-light font-normal mt-0.5">romrxbodybuilding.com/legal</span>
              </span>
              <ChevronRight size={14} className="text-charcoal-light" />
            </a>
          </div>
        </Section>

        {/* ── NOTIFICATIONS ── */}
        <Section title="Notifications" icon={<Bell size={14} />}>
          {notifLoading ? (
            <div className="flex items-center gap-2 py-2">
              <Loader2 size={14} className="animate-spin text-teal" />
              <span className="text-sm text-charcoal-light">Loading preferences...</span>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Timezone display */}
              <div className="flex items-center justify-between">
                <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide">Your Timezone</p>
                <span className="text-xs font-medium text-charcoal bg-teal-light px-2.5 py-1 rounded-full">
                  {browserTimezone}
                </span>
              </div>

              {/* Email reminders toggle */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-charcoal">Email reminders</p>
                    <p className="text-xs text-charcoal-light mt-0.5">
                      Get an email on protocol days (Mon/Thu/Sun, Tue/Fri, Wed/Sat)
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={emailReminders}
                    onClick={() => setEmailReminders(v => !v)}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2',
                      emailReminders ? 'bg-teal' : 'bg-charcoal-light/30'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                        emailReminders ? 'translate-x-6' : 'translate-x-1'
                      )}
                    />
                  </button>
                </div>

                {/* Reminder time picker — shown when email reminders on */}
                {emailReminders && (
                  <div className="flex items-center gap-3 pl-1">
                    <label className="text-xs text-charcoal-light font-semibold uppercase tracking-wide whitespace-nowrap">
                      Reminder time
                    </label>
                    <input
                      type="time"
                      value={reminderTime}
                      onChange={e => setReminderTime(e.target.value)}
                      className="rounded-xl border border-teal-light bg-surface px-3 py-2 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal"
                    />
                    <span className="text-xs text-charcoal-light">({browserTimezone})</span>
                  </div>
                )}
              </div>

              {/* Push notifications toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-charcoal">Push notifications</p>
                    <p className="text-xs text-charcoal-light mt-0.5">
                      Browser push alerts on protocol days
                    </p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={pushReminders}
                    onClick={() => {
                      if (!pushReminders) {
                        handleEnablePush()
                      } else {
                        setPushReminders(false)
                      }
                    }}
                    disabled={pushLoading}
                    className={cn(
                      'relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-teal focus:ring-offset-2 disabled:opacity-50',
                      pushReminders ? 'bg-teal' : 'bg-charcoal-light/30'
                    )}
                  >
                    {pushLoading ? (
                      <Loader2 size={12} className="animate-spin text-white mx-auto" />
                    ) : (
                      <span
                        className={cn(
                          'inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform',
                          pushReminders ? 'translate-x-6' : 'translate-x-1'
                        )}
                      />
                    )}
                  </button>
                </div>

                {pushMsg && (
                  <div className={cn(
                    'flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-medium',
                    pushMsg.type === 'ok'
                      ? 'bg-teal-light text-teal'
                      : 'bg-red-tier-bg text-red-tier'
                  )}>
                    {pushMsg.type === 'ok' ? <CheckCircle2 size={12} /> : <span className="font-bold">!</span>}
                    {pushMsg.text}
                  </div>
                )}
              </div>

              {/* Protocol schedule reference */}
              <div className="rounded-xl bg-surface border border-teal-light/60 px-4 py-3 space-y-1.5">
                <p className="text-xs font-semibold text-charcoal-light uppercase tracking-wide">Protocol Schedule</p>
                <div className="space-y-1">
                  {[
                    { days: 'Mon / Thu / Sun', protocol: 'Protocol 1' },
                    { days: 'Tue / Fri', protocol: 'Protocol 2' },
                    { days: 'Wed / Sat', protocol: 'Protocol 3' },
                  ].map(({ days, protocol }) => (
                    <div key={days} className="flex items-center justify-between">
                      <span className="text-xs text-charcoal-light">{days}</span>
                      <span className="text-xs font-semibold text-teal">{protocol}</span>
                    </div>
                  ))}
                </div>
              </div>

              {notifErr && (
                <p className="text-xs text-red-tier font-medium">{notifErr}</p>
              )}

              <button
                onClick={handleSaveNotifications}
                disabled={notifSaving}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {notifSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {notifSaved ? 'Saved!' : 'Save Notification Settings'}
              </button>
            </div>
          )}
        </Section>

        {/* ── ACCOUNT ── */}
        <Section title="Account">
          <div className="space-y-4 -mt-1">

            {/* Change password */}
            <div className="space-y-3">
              <p className="text-xs text-charcoal-light font-semibold uppercase tracking-wide flex items-center gap-1.5">
                <KeyRound size={12} />
                Change Password
              </p>
              <input
                type="password"
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="New password"
                className="w-full rounded-xl border border-teal-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal"
              />
              <input
                type="password"
                value={confirmPw}
                onChange={e => setConfirmPw(e.target.value)}
                placeholder="Confirm new password"
                className="w-full rounded-xl border border-teal-light bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-teal"
              />
              {pwMsg && (
                <p className={cn(
                  'text-xs font-medium flex items-center gap-1.5',
                  pwMsg.type === 'ok' ? 'text-teal' : 'text-red-tier'
                )}>
                  {pwMsg.type === 'ok' && <CheckCircle2 size={12} />}
                  {pwMsg.text}
                </p>
              )}
              <button
                onClick={handleChangePassword}
                disabled={pwSaving || !newPassword}
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                {pwSaving ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />}
                {pwSaving ? 'Updating...' : 'Update Password'}
              </button>
            </div>

            <div className="border-t border-teal-light pt-3">
              <button
                onClick={handleSignOut}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-surface border border-teal-light text-sm font-medium text-charcoal hover:bg-teal-light transition-colors"
              >
                <LogOut size={15} className="text-charcoal-light shrink-0" />
                <span className="flex-1 text-left">Sign out</span>
                <ChevronRight size={14} className="text-charcoal-light" />
              </button>
            </div>

            <div className="border-t border-red-100 pt-3">
              <p className="text-xs text-charcoal-light mb-2">Danger zone</p>
              <button
                onClick={() => setShowDelete(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-red-tier-bg border border-red-200 text-sm font-medium text-red-tier hover:bg-red-100 transition-colors"
              >
                <Trash2 size={15} className="shrink-0" />
                <span className="flex-1 text-left">
                  Delete account
                  <span className="block text-xs font-normal mt-0.5 opacity-70">Removes all your data permanently</span>
                </span>
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </Section>
      </div>

      {/* ── DELETE MODAL ── */}
      {showDelete && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4 pb-4 sm:pb-0">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-red-tier-bg flex items-center justify-center shrink-0">
                <Trash2 size={16} className="text-red-tier" />
              </div>
              <h3 className="font-display font-bold text-lg text-charcoal">Delete Account</h3>
            </div>
            <p className="text-sm text-charcoal-light leading-relaxed">
              This removes your profile, assessments, and protocol data. It cannot be undone.
              Type <span className="font-bold text-charcoal">DELETE</span> to confirm.
            </p>
            <input
              type="text"
              value={deleteText}
              onChange={e => setDeleteText(e.target.value)}
              placeholder="Type DELETE"
              className="w-full rounded-xl border border-red-200 bg-surface px-3 py-2.5 text-sm text-charcoal focus:outline-none focus:ring-2 focus:ring-red-400"
            />
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => { setShowDelete(false); setDeleteText('') }}
                className="flex-1 px-4 py-2.5 rounded-xl bg-surface border border-teal-light text-sm font-medium text-charcoal hover:bg-teal-light transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteText !== 'DELETE' || deleting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-tier text-white text-sm font-medium disabled:opacity-40 hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
              >
                {deleting && <Loader2 size={14} className="animate-spin" />}
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
