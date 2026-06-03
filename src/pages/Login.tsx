import { useEffect, useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Lock, Mail, Loader2, Eye, EyeOff } from 'lucide-react'

export function Login() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail]         = useState('')
  const [password, setPassword]   = useState('')
  const [showPw, setShowPw]       = useState(false)
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [magicSent, setMagicSent] = useState(false)
  const [mode, setMode]           = useState<'password' | 'magic'>('password')
  const [cooldown, setCooldown]   = useState(0)

  useEffect(() => {
    if (session) navigate('/dashboard/my-body', { replace: true })
  }, [session, navigate])

  useEffect(() => {
    const stored = localStorage.getItem('romrx_magic_sent_at')
    if (stored) {
      const secondsLeft = 60 - Math.floor((Date.now() - Number(stored)) / 1000)
      if (secondsLeft > 0) setCooldown(secondsLeft)
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) return
    setLoading(true); setError('')

    const { error: err } = await supabase.auth.signInWithPassword({ email, password })
    setLoading(false)
    if (err) {
      setError(err.message === 'Invalid login credentials'
        ? 'Incorrect email or password.'
        : err.message)
    }
  }

  const handleMagic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || cooldown > 0) return
    setLoading(true); setError('')

    const { error: err } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })
    setLoading(false)
    if (err) {
      setError(err.message.includes('rate') || err.message.includes('many')
        ? 'Too many attempts. Wait a minute and try again, or use your password instead.'
        : err.message)
    } else {
      setMagicSent(true)
      localStorage.setItem('romrx_magic_sent_at', String(Date.now()))
      setCooldown(60)
    }
  }

  return (
    <div className="miami-auth-shell flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm relative z-10">

        {/* Wordmark */}
        <div className="text-center mb-8">
          <h1 className="miami-wordmark text-4xl">
            ROMRx<span className="accent">BB</span>
          </h1>
          <p className="miami-sublabel text-xs mt-2">Bodybuilding Dashboard</p>
        </div>

        <div className="miami-panel p-6">

          {/* Mode tabs */}
          <div className="miami-tab-row">
            <button
              onClick={() => { setMode('password'); setError('') }}
              className={`miami-tab ${mode === 'password' ? 'active' : ''}`}
            >
              Password
            </button>
            <button
              onClick={() => { setMode('magic'); setError(''); setMagicSent(false) }}
              className={`miami-tab ${mode === 'magic' ? 'active' : ''}`}
            >
              Magic Link
            </button>
          </div>

          {mode === 'password' ? (
            <form onSubmit={handlePassword} className="space-y-4">
              <div>
                <label className="miami-label">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus
                  className="miami-input"
                />
              </div>

              <div>
                <label className="miami-label">Password</label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password} onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••" required
                    className="miami-input pr-10"
                  />
                  <button type="button" onClick={() => setShowPw(s => !s)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-miami-teal hover:text-miami">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {error && <p className="miami-error">{error}</p>}

              <button type="submit" disabled={loading} className="miami-btn-primary">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                Sign In
              </button>

              <div className="flex items-center justify-between pt-1">
                <button type="button"
                  onClick={() => { setMode('magic'); setError(''); setMagicSent(false) }}
                  className="text-xs miami-link">
                  Forgot password?
                </button>
                <button type="button"
                  onClick={() => { setMode('magic'); setError(''); setMagicSent(false) }}
                  className="text-xs text-white/40 hover:text-white/70 underline">
                  Use magic link
                </button>
              </div>
            </form>
          ) : magicSent ? (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-full bg-miami-teal/10 border border-miami-teal/40 flex items-center justify-center mx-auto mb-4">
                <Mail size={24} className="text-miami-teal" />
              </div>
              <h2 className="font-display text-lg text-white mb-1 tracking-wider">CHECK YOUR EMAIL</h2>
              <p className="text-sm text-white/60">Link sent to <strong className="text-white">{email}</strong></p>
              <button onClick={() => { setMagicSent(false); setMode('password') }}
                className="mt-5 text-xs miami-link">
                Use password instead
              </button>
            </div>
          ) : (
            <form onSubmit={handleMagic} className="space-y-4">
              <div>
                <label className="miami-label">Email</label>
                <input
                  type="email" value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@example.com" required autoFocus
                  className="miami-input"
                />
              </div>

              {error && <p className="miami-error">{error}</p>}

              <button type="submit" disabled={loading || cooldown > 0} className="miami-btn-primary">
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                {cooldown > 0 ? `Resend in ${cooldown}s` : 'Send Magic Link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-white/50 mt-5">
          New athlete?{' '}
          <Link to="/signup" className="miami-link">Create an account</Link>
        </p>
        <p className="text-center text-xs text-white/25 mt-4 tracking-wider uppercase font-condensed">
          Know What Your Body Can Lift
        </p>
      </div>
    </div>
  )
}
