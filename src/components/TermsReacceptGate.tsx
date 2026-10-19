import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { TERMS_VERSION, isReacceptGateEnabled, reacceptGateSkipsPath, recordTermsReaccept } from '../lib/terms'

type Status = 'idle' | 'checking' | 'needed' | 'ok'

/**
 * One-time clickwrap at sign-in for anyone without a consents row for the CURRENT TERMS_VERSION.
 * Same behavior and copy as romrx-io-web #147 (Stacy PASS Oct 5). Feature flag, default OFF.
 * The box starts unchecked and only the person's own tap checks it.
 */
export function TermsReacceptGate() {
  const { user, loading } = useAuth()
  const { pathname, search } = useLocation()
  const [status, setStatus] = useState<Status>('idle')
  const [agreed, setAgreed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const enabled = (() => {
    let storage: Storage | null = null
    try { storage = window.sessionStorage } catch { storage = null }
    const flag = (import.meta as unknown as { env: Record<string, string | undefined> }).env.VITE_TERMS_REACCEPT_GATE
    return isReacceptGateEnabled(flag, window.location.hostname, search, storage)
  })()

  useEffect(() => {
    if (!enabled || loading || !user) { setStatus('idle'); return }
    let alive = true
    setStatus('checking')
    void supabase
      .from('consents')
      .select('id')
      .eq('user_id', user.id)
      .eq('terms_version', TERMS_VERSION)
      .limit(1)
      .then(({ data, error: err }) => {
        if (!alive) return
        // If the check itself fails, do not block the person; the next sign-in checks again.
        if (err) { setStatus('ok'); return }
        setStatus(data && data.length > 0 ? 'ok' : 'needed')
      })
    return () => { alive = false }
  }, [enabled, loading, user])

  if (!enabled || status !== 'needed' || reacceptGateSkipsPath(pathname)) return null

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!agreed || saving) return
    setSaving(true); setError('')
    const ok = await recordTermsReaccept(navigator.userAgent)
    setSaving(false)
    if (!ok) { setError("We couldn't save that. Please try again."); return }
    setStatus('ok')
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="rx-reaccept-title"
      data-testid="terms-reaccept-gate"
      className="fixed inset-0 z-[10002] bg-surface overflow-y-auto flex items-center justify-center px-4 py-10"
    >
      <form onSubmit={submit} className="bg-white rounded-2xl border border-teal-light p-6 space-y-4 shadow-sm w-full max-w-sm">
        <h1 className="font-display font-bold text-teal text-2xl text-center">ROMRx</h1>
        <p id="rx-reaccept-title" className="text-sm font-semibold text-charcoal leading-snug">
          Please confirm your agreement to continue.
        </p>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={e => setAgreed(e.target.checked)}
            data-testid="terms-reaccept-checkbox"
            className="mt-0.5 h-4 w-4 rounded border-teal-light accent-teal shrink-0 cursor-pointer"
          />
          <span className="text-xs text-charcoal-light leading-relaxed">
            I have read and agree to the ROMRx LLC{' '}
            <a href="https://romrx.io/legal" target="_blank" rel="noopener noreferrer" className="text-teal underline font-medium">
              Terms of Service, Privacy Policy & Refund Policy
            </a>
            , a company-wide agreement with ROMRx LLC and its products.
          </span>
        </label>
        {error && <p className="text-xs text-red-700 bg-red-50 rounded-xl px-3 py-2">{error}</p>}
        <button type="submit" disabled={!agreed || saving} className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50">
          {saving && <Loader2 size={15} className="animate-spin" />}
          Continue
        </button>
        <p className="text-center">
          <button type="button" onClick={() => { void supabase.auth.signOut() }} className="text-xs text-charcoal-light underline">
            Sign out
          </button>
        </p>
      </form>
    </div>
  )
}
