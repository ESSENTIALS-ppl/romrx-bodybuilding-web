import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { recordConsent } from '../lib/terms'
import { Loader2, UserPlus } from 'lucide-react'

type BBTier = 'beginner' | 'intermediate' | 'advanced'
const TIER_OPTIONS: { value: BBTier; label: string; hint: string }[] = [
  { value: 'beginner',     label: 'Beginner',     hint: '88 lifts' },
  { value: 'intermediate', label: 'Intermediate', hint: '205 lifts' },
  { value: 'advanced',     label: 'Advanced',     hint: '274 lifts' },
]

export function Signup() {
  const navigate = useNavigate()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [confirm, setConfirm]     = useState('')
  const [fullName, setFullName]   = useState('')
  const [tier, setTier]           = useState<BBTier>('beginner')
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
        data: { full_name: fullName, active_bb_tier: tier, active_sport: 'bodybuilding' },
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    })

    if (signUpErr) {
      setError(signUpErr.message)
      setLoading(false)
      return
    }

    if (data.user) {
      // Upsert user profile row — bodybuilding context, BB tier honored
      await supabase.from('users').upsert({
        id: data.user.id,
        email,
        full_name: fullName,
        active_sport: 'bodybuilding',
        active_bb_tier: tier,
        portal_role: 'athlete',
        subscription_status: 'trialing',
        subscription_tier: 'athlete',
        platforms: ['bodybuilding'],
      }, { onConflict: 'id' })

      // Create athlete row so the assessment flow can link to it later
      await supabase.from('athletes').upsert({
        user_id: data.user.id,
        email,
        full_name: fullName,
        dominant_side: 'right',
        injury_flags: [],
        onboarding_status: 'pending_payment',
        is_active: false,
      }, { onConflict: 'user_id' })

      // Record timestamped proof of agreement to the ROMRx LLC Terms of Service.
      await recordConsent({ userId: data.user.id, signedName: fullName })

      navigate('/onboarding/assessment', { replace: true })
      return
    }

    setLoading(false)
    setError('Something went wrong. Please try again.')
  }

  return (
    <div className="miami-auth-shell flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm relative z-10">

        <div className="text-center mb-8">
          <h1 className="miami-wordmark text-4xl">
            ROMRx<span className="accent">BB</span>
          </h1>
          <p className="miami-sublabel text-xs mt-2">Create Your Account</p>
        </div>

        <form onSubmit={handleSubmit} className="miami-panel p-6 space-y-4">

          <div>
            <label className="miami-label">Full Name</label>
            <input
              type="text" value={fullName} onChange={e => setFullName(e.target.value)}
              placeholder="First Last" required autoFocus
              className="miami-input"
            />
          </div>

          <div>
            <label className="miami-label">Email</label>
            <input
              type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com" required
              className="miami-input"
            />
          </div>

          <div>
            <label className="miami-label">Password</label>
            <input
              type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Min. 6 characters" required
              className="miami-input"
            />
          </div>

          <div>
            <label className="miami-label">Confirm Password</label>
            <input
              type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="Repeat password" required
              className="miami-input"
            />
          </div>

          <div>
            <label className="miami-label">Starting Tier</label>
            <div className="miami-tier-grid">
              {TIER_OPTIONS.map(t => (
                <button
                  key={t.value} type="button"
                  onClick={() => setTier(t.value)}
                  className={`miami-tier-pill ${tier === t.value ? 'selected' : ''}`}
                >
                  <div>{t.label}</div>
                  <div className="text-[10px] opacity-70 font-normal tracking-normal normal-case mt-0.5">
                    {t.hint}
                  </div>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-white/40 mt-2 leading-relaxed">
              Pick your honest starting point. Your ROM assessment will fine-tune
              what you unlock — you can always change this in Settings.
            </p>
          </div>

          <label className="flex items-start gap-3 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={e => setAgreedToTerms(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded shrink-0 cursor-pointer accent-miami"
            />
            <span className="text-xs text-white/60 leading-relaxed">
              I have read and agree to the{' '}
              <a href="/legal" target="_blank" rel="noopener noreferrer" className="miami-link font-medium">
                ROMRx LLC Terms of Service, Privacy Policy &amp; Refund Policy
              </a>
              , a company-wide agreement with ROMRx LLC (parent of ROMRxBodyBuilding, ROMRxBJJ, and other ROMRx products), including the collection and anonymized use of my ROM data for research and product development. All sales are final.
            </span>
          </label>

          {error && <p className="miami-error">{error}</p>}

          <button type="submit" disabled={loading || !agreedToTerms} className="miami-btn-primary mt-2">
            {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
            Create Account &amp; Start Assessment
          </button>
        </form>

        <p className="text-center text-xs text-white/50 mt-5">
          Already have an account?{' '}
          <Link to="/login" className="miami-link">Sign in</Link>
        </p>
        <p className="text-center text-xs text-white/25 mt-4 tracking-wider uppercase font-condensed">
          Know What Your Body Can Lift
        </p>
      </div>
    </div>
  )
}
