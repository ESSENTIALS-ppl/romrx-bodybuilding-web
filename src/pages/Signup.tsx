import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Loader2, UserPlus } from 'lucide-react'

const BELTS = ['white', 'blue', 'purple', 'brown', 'black']

export function Signup() {
  const navigate = useNavigate()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [fullName, setFullName]   = useState('')
  const [belt, setBelt]           = useState('white')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [agreedToTerms, setAgreedToTerms] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (password !== confirm) { setError('Passwords do not match.'); return }
    if (password.length < 6)  { setError('Password must be at least 6 characters.'); return }
    if (!agreedToTerms)       { setError('You must agree to the Terms of Service to continue.'); return }
    setLoading(true); setError('')

    const { data, error: signUpErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName, belt },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })

    if (signUpErr) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    if (data.user) {
      // Upsert user profile row
      await supabase.from('users').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        belt,
        portal_role: 'athlete',
        subscription_status: 'trialing',
        subscription_tier: 'athlete',
        platforms: ['bjj'],
      }, { onConflict: 'id' })

      // Create athlete row so assessment can link to it later
      await supabase.from('athletes').upsert({
        user_id: data.user.id,
        email,
        full_name: fullName,
        belt,
        dominant_side: 'right',
        injury_flags: [],
        onboarding_status: 'pending_payment',
        is_active: false,
      }, { onConflict: 'user_id' })

      navigate('/onboarding/assessment', { replace: true })
      return
    }

    setLoading(false)
    setError('Something went wrong. Please try again.')
  }

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="font-display font-bold text-teal text-3xl">ROMRx</h1>
          <p className="text-charcoal-light text-sm mt-1">Create your athlete account</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-teal-light p-6 shadow-sm space-y-4">
          <div>
            <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-1.5">Full name</label>
            <input
              type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="First Last" required autoFocus
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-1.5">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-1.5">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 characters" required
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-1.5">Confirm password</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password" required
              className="w-full px-4 py-2.5 rounded-xl border border-teal-light bg-surface text-sm focus:outline-none focus:border-teal focus:bg-white transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-charcoal-light uppercase tracking-wide mb-2">Belt</label>
            <div className="flex gap-2 flex-wrap">
              {BELTS.map(b => (
                <button key={b} type="button" onClick={() => setBelt(b)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold uppercase transition-all ${
                    belt === b
                      ? 'bg-teal text-white ring-2 ring-offset-1 ring-teal'
                      : 'bg-surface text-charcoal-light hover:bg-teal-light'
                  }`}>
                  {b}
                </button>
              ))}
            </div>
          </div>

          {/* Terms of Service checkbox */}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-teal-light accent-teal shrink-0 cursor-pointer"
            />
            <span className="text-xs text-charcoal-light leading-relaxed">
              I have read and agree to the{' '}
              <a href="/legal" target="_blank" rel="noopener noreferrer" className="text-teal underline font-medium">
                Terms of Service, Privacy Policy &amp; Refund Policy
              </a>
              , including the collection and anonymized use of my ROM data for research and product development. All sales are final.
            </span>
          </label>

          {error && <p className="text-xs text-red-tier bg-red-tier-bg rounded-lg px-3 py-2">{error}</p>}

          <button type="submit" disabled={loading || !agreedToTerms} className="btn-primary w-full flex items-center justify-center gap-2 mt-2 disabled:opacity-50">
            {loading ? <Loader2 size={15} className="animate-spin" /> : <UserPlus size={15} />}
            Create account & start assessment
          </button>
        </form>

        <p className="text-center text-xs text-charcoal-light mt-4">
          Already have an account?{' '}
          <Link to="/login" className="text-teal underline">Sign in</Link>
        </p>
        <p className="text-center text-xs text-charcoal-light mt-6">Position Readiness Protocol™ by ROMRx</p>
      </div>
    </div>
  )
}
