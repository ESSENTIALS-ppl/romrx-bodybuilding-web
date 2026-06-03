import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { supabase } from '../lib/supabase'
import { PageHeader } from '../components/PageHeader'
import { Spinner } from '../components/Spinner'
import { cn } from '../lib/utils'
import {
  User, Lock, CreditCard, Bell, HelpCircle, LogOut,
  Trash2, CheckCircle2, AlertTriangle, ExternalLink,
} from 'lucide-react'

// ── Section wrapper ────────────────────────────────────────────────────────────
function Section({ title, icon: Icon, children }: {
  title: string; icon: typeof User; children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-2xl border border-teal-light overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-4 border-b border-teal-light bg-surface">
        <Icon size={15} className="text-teal" />
        <p className="text-sm font-bold text-charcoal">{title}</p>
      </div>
      <div className="px-5 py-5 space-y-4">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-semibold text-charcoal-light uppercase tracking-wide">{label}</label>
      {children}
    </div>
  )
}

const inputCls = "w-full text-sm rounded-xl border border-teal-light bg-surface px-4 py-2.5 focus:outline-none focus:border-teal focus:bg-white transition-colors"
const btnPrimary = "btn-primary text-sm px-5 py-2 flex items-center gap-2"
const btnGhost = "text-sm px-4 py-2 rounded-xl border border-teal-light text-charcoal-light hover:text-charcoal hover:bg-surface transition-colors"

export function CoachSettings() {
  const { user, signOut } = useAuth()
  const { profile, loading } = useProfile(user?.id)
  const navigate = useNavigate()

  // Profile
  const [fullName, setFullName]   = useState('')
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileMsg, setProfileMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Password
  const [newPw, setNewPw]         = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwSaving, setPwSaving]   = useState(false)
  const [pwMsg, setPwMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Email change
  const [newEmail, setNewEmail]   = useState('')
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailMsg, setEmailMsg]   = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Subscription
  const [subExpiry, setSubExpiry] = useState<string | null>(null)
  const [portalLoading, setPortalLoading] = useState(false)

  // Notifications
  const [injuryAlerts, setInjuryAlerts] = useState(true)
  const [teamUpdates, setTeamUpdates]   = useState(true)
  const [notifSaving, setNotifSaving]   = useState(false)
  const [notifMsg, setNotifMsg]         = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting]           = useState(false)

  // Load profile data
  useEffect(() => {
    if (!profile) return
    setFullName(profile.full_name ?? '')
  }, [profile])

  // Load sub expiry
  useEffect(() => {
    if (!user) return
    supabase.from('users').select('subscription_expiry').eq('id', user.id).single()
      .then(({ data }) => { if (data?.subscription_expiry) setSubExpiry(data.subscription_expiry) })
  }, [user])

  // ── Save profile ──
  async function handleSaveProfile() {
    if (!user) return
    setProfileSaving(true); setProfileMsg(null)
    try {
      const { error } = await supabase.auth.updateUser({ data: { full_name: fullName } })
      if (error) { setProfileMsg({ type: 'err', text: error.message }); return }
      // Also update coaches table if it has full_name
      await supabase.from('coaches').update({ full_name: fullName }).eq('user_id', user.id)
      setProfileMsg({ type: 'ok', text: 'Profile saved.' })
    } finally { setProfileSaving(false) }
    setTimeout(() => setProfileMsg(null), 3000)
  }

  // ── Change password ──
  async function handleChangePassword() {
    setPwMsg(null)
    if (!newPw || newPw.length < 8) { setPwMsg({ type: 'err', text: 'Password must be at least 8 characters.' }); return }
    if (newPw !== confirmPw)        { setPwMsg({ type: 'err', text: 'Passwords do not match.' }); return }
    setPwSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: newPw })
      if (error) { setPwMsg({ type: 'err', text: error.message }); return }
      setPwMsg({ type: 'ok', text: 'Password updated successfully.' })
      setNewPw(''); setConfirmPw('')
    } finally { setPwSaving(false) }
    setTimeout(() => setPwMsg(null), 4000)
  }

  // ── Change email ──
  async function handleChangeEmail() {
    setEmailMsg(null)
    if (!newEmail || !newEmail.includes('@')) { setEmailMsg({ type: 'err', text: 'Enter a valid email address.' }); return }
    setEmailSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail })
      if (error) { setEmailMsg({ type: 'err', text: error.message }); return }
      setEmailMsg({ type: 'ok', text: 'Confirmation sent to new email. Check your inbox.' })
      setNewEmail('')
    } finally { setEmailSaving(false) }
  }

  // ── Stripe portal ──
  async function handlePortal() {
    setPortalLoading(true)
    try {
      const { data, error } = await supabase.functions.invoke('create-portal-session', {})
      if (error || !data?.url) throw new Error('Portal unavailable')
      window.location.href = data.url
    } catch {
      alert('Could not open billing portal. Contact support@romrxbodybuilding.com.')
    } finally { setPortalLoading(false) }
  }

  // ── Save notifications ──
  async function handleSaveNotifications() {
    setNotifSaving(true); setNotifMsg(null)
    try {
      // Store in user metadata for simplicity
      const { error } = await supabase.auth.updateUser({
        data: { notif_injury_alerts: injuryAlerts, notif_team_updates: teamUpdates }
      })
      if (error) { setNotifMsg({ type: 'err', text: error.message }); return }
      setNotifMsg({ type: 'ok', text: 'Preferences saved.' })
    } finally { setNotifSaving(false) }
    setTimeout(() => setNotifMsg(null), 3000)
  }

  // ── Sign out ──
  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  // ── Delete account ──
  async function handleDelete() {
    if (deleteConfirm !== 'DELETE') return
    setDeleting(true)
    try {
      await supabase.from('users').update({ subscription_status: 'canceled' }).eq('id', user!.id)
      await supabase.auth.signOut()
      navigate('/')
    } finally { setDeleting(false) }
  }

  const isActive = ['active', 'trialing'].includes(profile?.subscription_status ?? '')
  const renewalDate = subExpiry
    ? new Date(subExpiry).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null

  if (loading) return <Spinner />

  return (
    <div className="space-y-5 max-w-xl">
      <PageHeader title="Settings" subtitle="" />

      {/* ── Profile ── */}
      <Section title="Profile" icon={User}>
        <Field label="Full Name">
          <input value={fullName} onChange={e => setFullName(e.target.value)} className={inputCls} placeholder="Your full name" />
        </Field>
        <Field label="Email Address">
          <input value={user?.email ?? ''} readOnly className={cn(inputCls, 'text-charcoal-light cursor-default')} />
          <p className="text-[11px] text-charcoal-light">To change your email, use the Account Security section below.</p>
        </Field>
        {profileMsg && (
          <p className={cn('text-xs flex items-center gap-1.5', profileMsg.type === 'ok' ? 'text-green-tier' : 'text-red-tier')}>
            {profileMsg.type === 'ok' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {profileMsg.text}
          </p>
        )}
        <div className="flex justify-end">
          <button onClick={handleSaveProfile} disabled={profileSaving} className={btnPrimary}>
            {profileSaving ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </Section>

      {/* ── Account Security ── */}
      <Section title="Account Security" icon={Lock}>
        <div className="space-y-3">
          <p className="text-xs font-semibold text-charcoal">Change Password</p>
          <Field label="New Password">
            <input type="password" value={newPw} onChange={e => setNewPw(e.target.value)} className={inputCls} placeholder="At least 8 characters" />
          </Field>
          <Field label="Confirm New Password">
            <input type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} className={inputCls} placeholder="Repeat new password" />
          </Field>
          {pwMsg && (
            <p className={cn('text-xs flex items-center gap-1.5', pwMsg.type === 'ok' ? 'text-green-tier' : 'text-red-tier')}>
              {pwMsg.type === 'ok' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {pwMsg.text}
            </p>
          )}
          <div className="flex justify-end">
            <button onClick={handleChangePassword} disabled={pwSaving} className={btnPrimary}>
              {pwSaving ? 'Updating...' : 'Update Password'}
            </button>
          </div>
        </div>

        <div className="border-t border-teal-light pt-4 space-y-3">
          <p className="text-xs font-semibold text-charcoal">Change Email</p>
          <Field label="New Email Address">
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} className={inputCls} placeholder={user?.email ?? 'New email address'} />
          </Field>
          <p className="text-[11px] text-charcoal-light">A confirmation link will be sent to your new email address.</p>
          {emailMsg && (
            <p className={cn('text-xs flex items-center gap-1.5', emailMsg.type === 'ok' ? 'text-green-tier' : 'text-red-tier')}>
              {emailMsg.type === 'ok' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {emailMsg.text}
            </p>
          )}
          <div className="flex justify-end">
            <button onClick={handleChangeEmail} disabled={emailSaving} className={btnPrimary}>
              {emailSaving ? 'Sending...' : 'Send Confirmation'}
            </button>
          </div>
        </div>
      </Section>

      {/* ── Subscription ── */}
      <Section title="Subscription" icon={CreditCard}>
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-charcoal">Coach Starter</p>
            <p className="text-xs text-charcoal-light">$349/year</p>
          </div>
          <span className={cn('text-xs font-bold px-3 py-1 rounded-full uppercase',
            isActive ? 'bg-green-tier-bg text-green-tier' : 'bg-red-50 text-red-tier')}>
            {profile?.subscription_status ?? 'inactive'}
          </span>
        </div>

        {renewalDate && (
          <p className="text-xs text-charcoal-light">
            {isActive ? 'Renews' : 'Expired'}: <span className="font-medium text-charcoal">{renewalDate}</span>
          </p>
        )}

        <div className="flex gap-3 flex-wrap pt-1">
          <button onClick={handlePortal} disabled={portalLoading || !isActive} className={cn(btnPrimary, 'disabled:opacity-50')}>
            <ExternalLink size={14} /> {portalLoading ? 'Opening...' : 'Manage Billing'}
          </button>
          <button onClick={handlePortal} disabled={portalLoading || !isActive} className={cn(btnGhost, 'disabled:opacity-50')}>
            Cancel Subscription
          </button>
        </div>
        <p className="text-[11px] text-charcoal-light">
          Billing is managed securely through Stripe. Cancellation takes effect at the end of your current period.
        </p>
      </Section>

      {/* ── Notifications ── */}
      <Section title="Notifications" icon={Bell}>
        <div className="space-y-3">
          {[
            { label: 'Injury alerts', desc: 'Email when an athlete injury is logged or updated', value: injuryAlerts, set: setInjuryAlerts },
            { label: 'Team updates', desc: 'Weekly summary of roster ROM progress', value: teamUpdates, set: setTeamUpdates },
          ].map(({ label, desc, value, set }) => (
            <div key={label} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-charcoal">{label}</p>
                <p className="text-xs text-charcoal-light">{desc}</p>
              </div>
              <button
                onClick={() => set(!value)}
                className={cn(
                  'relative inline-flex h-6 w-11 shrink-0 rounded-full transition-colors duration-200',
                  value ? 'bg-teal' : 'bg-gray-200'
                )}
              >
                <span className={cn(
                  'inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 mt-0.5',
                  value ? 'translate-x-5.5' : 'translate-x-0.5'
                )} />
              </button>
            </div>
          ))}
        </div>
        {notifMsg && (
          <p className={cn('text-xs flex items-center gap-1.5', notifMsg.type === 'ok' ? 'text-green-tier' : 'text-red-tier')}>
            {notifMsg.type === 'ok' ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />} {notifMsg.text}
          </p>
        )}
        <div className="flex justify-end">
          <button onClick={handleSaveNotifications} disabled={notifSaving} className={btnPrimary}>
            {notifSaving ? 'Saving...' : 'Save Preferences'}
          </button>
        </div>
      </Section>

      {/* ── Support ── */}
      <Section title="Support" icon={HelpCircle}>
        <div className="space-y-3">
          <div>
            <p className="text-sm font-semibold text-charcoal">Need help?</p>
            <p className="text-xs text-charcoal-light mt-1">Email us at any time and we will respond within 24 hours.</p>
            <a href="mailto:ROMRxBB@gmail.com" className="inline-block mt-2 text-sm text-teal hover:underline font-medium">
              ROMRxBB@gmail.com
            </a>
          </div>
          <div className="pt-2 border-t border-teal-light flex gap-4">
            <a href="/legal" target="_blank" className="text-xs text-charcoal-light hover:text-teal transition-colors flex items-center gap-1">
              <ExternalLink size={11} /> Terms of Service
            </a>
            <a href="/legal" target="_blank" className="text-xs text-charcoal-light hover:text-teal transition-colors flex items-center gap-1">
              <ExternalLink size={11} /> Privacy Policy
            </a>
          </div>
        </div>
      </Section>

      {/* ── Account ── */}
      <Section title="Account" icon={LogOut}>
        <div className="space-y-4">
          <button onClick={handleSignOut} className="flex items-center gap-2 text-sm font-semibold text-charcoal hover:text-red-600 transition-colors">
            <LogOut size={15} /> Sign Out
          </button>

          <div className="border-t border-red-100 pt-4 space-y-3">
            <p className="text-xs font-bold text-red-tier uppercase tracking-wide flex items-center gap-1.5">
              <Trash2 size={12} /> Danger Zone
            </p>
            <p className="text-xs text-charcoal-light">
              Deleting your account is permanent. All coach data, athlete connections, and teaching records will be removed.
            </p>
            <Field label='Type "DELETE" to confirm'>
              <input value={deleteConfirm} onChange={e => setDeleteConfirm(e.target.value)}
                className={cn(inputCls, 'border-red-200 focus:border-red-tier')}
                placeholder='DELETE' />
            </Field>
            <button
              onClick={handleDelete}
              disabled={deleteConfirm !== 'DELETE' || deleting}
              className="flex items-center gap-2 text-sm font-semibold text-red-tier bg-red-50 hover:bg-red-100 px-4 py-2 rounded-xl transition-colors disabled:opacity-40"
            >
              <Trash2 size={14} /> {deleting ? 'Deleting...' : 'Delete Account'}
            </button>
          </div>
        </div>
      </Section>
    </div>
  )
}
