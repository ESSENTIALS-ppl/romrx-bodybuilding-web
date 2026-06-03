import { useState } from 'react'
import { Building2 } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { SectionCard } from '../components/SectionCard'

export function MySchool() {
  const [email, setEmail] = useState('')
  const [submitted, setSubmitted] = useState(false)

  function handleNotify() {
    if (!email.trim()) return
    setSubmitted(true)
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="My School"
        subtitle="Your gym and team features"
      />

      <SectionCard title="">
        <div className="flex flex-col items-center text-center py-8 space-y-5 max-w-sm mx-auto">
          <div className="w-16 h-16 rounded-full bg-teal-light flex items-center justify-center">
            <Building2 size={28} className="text-teal" />
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
              <div className="flex gap-2">
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleNotify()}
                  placeholder="your@email.com"
                  className="flex-1 text-sm rounded-xl border border-teal-light bg-surface px-3 py-2 focus:outline-none focus:border-teal focus:bg-white transition-colors"
                />
                <button
                  onClick={handleNotify}
                  disabled={!email.trim()}
                  className="btn-primary text-sm px-4 py-2 disabled:opacity-50"
                >
                  Notify me
                </button>
              </div>
            )}
          </div>
        </div>
      </SectionCard>
    </div>
  )
}
