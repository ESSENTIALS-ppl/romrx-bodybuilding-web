import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, SUPABASE_URL, SUPABASE_ANON } from '../lib/supabase'
import { Loader2, Users } from 'lucide-react'

const BELTS = ['white', 'blue', 'purple', 'brown', 'black']
const CHECKOUT_URL = `${SUPABASE_URL}/functions/v1/create-checkout-session`

export function CoachSignup() {
  const [fullName, setFullName]   = useState('')
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [belt, setBelt]           = useState('white')
  const [gym, setGym]             = useState('')
  const [role, setRole]           = useState<'instructor' | 'head_coach'>('instructor')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState('')
  const [agreedToTerms, setAgreedToTerms]   = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!fullName.trim()) { setError('Full name is required.'); return }
    if (!gym.trim()) { setError('Gym / Academy name is required.'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return }
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (!agreedToTerms)   { setError('You must agree to the Terms of Service to continue.'); return }
    setLoading(true)

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          belt,
          gym,
          role: 'coach',
          portal_role: 'coach',
        },
      },
    })

    if (signUpErr) { setError(signUpErr.message); setLoading(false); return }

    if (data.user) {
      // Create public.users row as coach
      await supabase.from('users').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        belt,
        portal_role: 'coach',
        subscription_status: 'trialing',
        subscription_tier: 'coach',
        platforms: ['bjj'],
      }, { onConflict: 'id' })

      // Notify Jim of new coach account creation (pre-payment)
      // Fire-and-forget — don't block checkout on this
      fetch(`${SUPABASE_URL}/functions/v1/notify-coach-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, gym, paid: false }),
      }).catch(() => {})

      // Send "complete your payment" email to the coach
      fetch(`${SUPABASE_URL}/functions/v1/notify-coach-signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, fullName, gym, paid: false, sendToCoach: true }),
      }).catch(() => {})

      // Get session token for edge function call
      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (token) {
        const res = await fetch(CHECKOUT_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            'apikey': SUPABASE_ANON,
          },
          body: JSON.stringify({ email, full_name: fullName, plan: 'coach', gym }),
        })
        const { url, error: checkoutErr } = await res.json()
        if (url) { window.location.href = url; return }
        if (checkoutErr) { setError(`Payment setup failed: ${checkoutErr}`); setLoading(false); return }
      }
    }

    setLoading(false)
    setError('Something went wrong. Please try again.')
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="w-12 h-12 bg-teal-light rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Users size={22} className="text-teal" />
          </div>
          <h1 className="font-display font-bold text-teal text-2xl">Create Coach Account</h1>
          <p className="text-sm text-charcoal-light mt-1">
            ROMRxBB Coach Dashboard · $349/year
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-teal-light p-6 space-y-4 shadow-sm">

          <div className="space-y-1">
            <label className="text-sm font-semibold text-charcoal">Full Name</label>
            <input
              type="text" required value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-charcoal">Email Address</label>
            <input
              type="email" required value={email} onChange={e => setEmail(e.target.value)}
              placeholder="coach@example.com"
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-charcoal">Gym / Academy Name</label>
            <input
              type="text" required value={gym} onChange={e => setGym(e.target.value)}
              placeholder="Your academy name"
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-charcoal">Your Role</label>
            <div className="grid grid-cols-2 gap-2">
              {([['instructor', 'Instructor'], ['head_coach', 'Head Coach']] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setRole(val)}
                  className={`py-2.5 rounded-xl text-sm font-semibold border transition-all ${
                    role === val
                      ? 'bg-teal text-white border-teal'
                      : 'border-teal-light text-charcoal-light hover:border-teal/40'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-charcoal">Your Belt</label>
            <div className="flex gap-2 flex-wrap">
              {BELTS.map(b => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBelt(b)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-all border ${
                    belt === b
                      ? 'bg-teal text-white border-teal'
                      : 'border-teal-light text-charcoal-light hover:border-teal/40'
                  }`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-charcoal">Password</label>
            <input
              type="password" required value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          <div className="space-y-1">
            <label className="text-sm font-semibold text-charcoal">Confirm Password</label>
            <input
              type="password" required value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password"
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal transition-colors"
            />
          </div>

          {/* Terms checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" checked={agreedToTerms} onChange={e => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-teal-light accent-teal shrink-0 cursor-pointer" />
            <span className="text-xs text-charcoal-light leading-relaxed">
              I have read and agree to the{' '}
              <a href="/legal" target="_blank" rel="noopener noreferrer" className="text-teal underline font-medium">
                Terms of Service, Privacy Policy &amp; Refund Policy
              </a>
              . All sales are final.
            </span>
          </label>

          {error && (
            <p className="text-xs text-red-tier bg-red-tier-bg rounded-xl px-3 py-2">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !agreedToTerms}
            className="btn-primary w-full flex items-center justify-center gap-2 text-base py-3 mt-2 disabled:opacity-50"
          >
            {loading
              ? <><Loader2 size={16} className="animate-spin" /> Setting up your account...</>
              : <><Users size={16} /> Create Coach Account &amp; Continue to Payment</>
            }
          </button>

          <p className="text-center text-xs text-charcoal-light">
            $349/year · Includes unlimited athlete roster · Cancel anytime
          </p>
        </form>

        <p className="text-center text-sm text-charcoal-light">
          Are you an athlete?{' '}
          <Link to="/signup" className="text-teal font-semibold hover:underline">
            Athlete signup here
          </Link>
        </p>
        <p className="text-center text-sm text-charcoal-light">
          Already have an account?{' '}
          <Link to="/login" className="text-teal font-semibold hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
