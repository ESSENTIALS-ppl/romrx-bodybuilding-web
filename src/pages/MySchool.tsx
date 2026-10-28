import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'
import {
  submitWaitlist,
  isValidWaitlistEmail,
  WAITLIST_MSG_ERR,
  WAITLIST_MSG_RATE,
  WAITLIST_MSG_NAME,
  WAITLIST_MSG_EMAIL,
  WAITLIST_CONSENT_LEAD,
  WAITLIST_CONSENT_LINK_TEXT,
  WAITLIST_CONSENT_LINK_URL,
} from '../lib/waitlist'

export function MySchool() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [sending, setSending] = useState(false)
  const [hp, setHp] = useState('')
  const [error, setError] = useState('')

  async function handleNotify() {
    if (sending) return
    setError('')
    const trimmedName = name.trim()
    const trimmedEmail = email.trim()
    if (!trimmedName || trimmedName.length > 100) {
      setError(WAITLIST_MSG_NAME)
      return
    }
    if (!isValidWaitlistEmail(trimmedEmail)) {
      setError(WAITLIST_MSG_EMAIL)
      return
    }
    setSending(true)
    const result = await submitWaitlist({ name: trimmedName, email: trimmedEmail, role: 'gym', hp_website: hp })
    setSending(false)
    if (result === 'ok') setSubmitted(true)
    else setError(result === 'rate_limited' ? WAITLIST_MSG_RATE : WAITLIST_MSG_ERR)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My School"
        subtitle="Your gym and team features"
      />

      <SectionCard title="">
        <div className="flex flex-col items-center text-center py-8 space-y-5 max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-full bg-miami-light flex items-center justify-center">
            <Building2 size={28} className="text-miami" />
          </div>

          <div className="space-y-2">
            <h2 className="font-display font-bold text-charcoal text-xl">
              School features are coming soon
            </h2>
            <p className="text-sm text-charcoal-light leading-relaxed">
              Connect to your gym, see your team's training data, access class schedules,
              and stay in sync with your school's program. Check back soon.
            </p>
          </div>

          <div className="w-full space-y-2 pt-2">
            <label className="text-xs font-semibold text-charcoal-light uppercase tracking-wide block text-left">
              Get notified when it launches
            </label>
            {submitted ? (
              <div className="bg-green-50 border border-green-200 rounded-2xl px-4 py-3">
                <p className="text-sm font-semibold text-green-700">You're on the list</p>
                <p className="text-xs text-green-600 mt-0.5">We'll reach out when school features go live.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNotify()}
                  placeholder="Your name"
                  autoComplete="name"
                  maxLength={100}
                  className="w-full text-sm rounded-xl border border-miami-light bg-surface px-3 py-2 focus:outline-none focus:border-miami focus:bg-white transition-colors"
                />
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleNotify()}
                    placeholder="your@email.com"
                    autoComplete="email"
                    maxLength={254}
                    className="flex-1 text-sm rounded-xl border border-miami-light bg-surface px-3 py-2 focus:outline-none focus:border-miami focus:bg-white transition-colors"
                  />
                  <button
                    onClick={handleNotify}
                    disabled={sending || !name.trim() || !email.trim()}
                    className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                  >
                    {sending ? 'Sending...' : 'Notify me'}
                  </button>
                </div>
                {error && (
                  <p className="text-xs text-red-tier bg-red-tier-bg rounded-xl px-3 py-2 text-left">{error}</p>
                )}
                <p className="text-xs text-charcoal-light text-left">
                  {WAITLIST_CONSENT_LEAD}
                  <a href={WAITLIST_CONSENT_LINK_URL} className="text-miami underline">{WAITLIST_CONSENT_LINK_TEXT}</a>.
                </p>
                <input
                  type="text"
                  name="hp_website"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={hp}
                  onChange={e => setHp(e.target.value)}
                  style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, opacity: 0 }}
                />
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
