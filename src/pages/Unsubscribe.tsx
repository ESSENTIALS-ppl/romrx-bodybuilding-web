import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function Unsubscribe() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'missing'>('loading')
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const raw = params.get('email')

    if (!raw) {
      setStatus('missing')
      return
    }

    const decoded = decodeURIComponent(raw)
    setEmail(decoded)

    supabase
      .from('profiles')
      .update({ marketing_opt_out: true })
      .eq('email', decoded)
      .then(({ error }) => {
        if (error) {
          console.error('Unsubscribe error:', error)
          setStatus('error')
        } else {
          setStatus('success')
        }
      })
  }, [])

  return (
    <div style={styles.wrapper}>
      <div style={styles.card}>
        <img
          src="/romrx-logo.png"
          alt="ROMRxBodyBuilding"
          style={styles.logo}
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
        />

        {status === 'loading' && (
          <>
            <h1 style={styles.heading}>Unsubscribing…</h1>
            <p style={styles.body}>Please wait a moment.</p>
          </>
        )}

        {status === 'success' && (
          <>
            <h1 style={styles.heading}>You're unsubscribed.</h1>
            <p style={styles.body}>
              <strong>{email}</strong> has been removed from ROMRxBodyBuilding marketing emails.
              You will no longer receive follow-up or renewal reminder emails.
            </p>
            <p style={styles.note}>
              Changed your mind? Re-enable emails anytime in your{' '}
              <a href="/dashboard/settings" style={styles.link}>account settings</a>.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <h1 style={styles.heading}>Something went wrong.</h1>
            <p style={styles.body}>
              We couldn’t process your request. Email us at{' '}
              <a href="mailto:support@romrxbodybuilding.com" style={styles.link}>support@romrxbodybuilding.com</a>{' '}
              and we’ll remove you manually.
            </p>
          </>
        )}

        {status === 'missing' && (
          <>
            <h1 style={styles.heading}>Invalid link.</h1>
            <p style={styles.body}>
              This unsubscribe link is missing the email address. Please use the link
              directly from your email.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0a0a0a',
    fontFamily: 'Inter, sans-serif',
    padding: '24px',
  },
  card: {
    backgroundColor: '#141414',
    border: '1px solid #2a2a2a',
    borderRadius: '12px',
    padding: '48px 40px',
    maxWidth: '480px',
    width: '100%',
    textAlign: 'center',
  },
  logo: {
    height: '48px',
    marginBottom: '32px',
  },
  heading: {
    color: '#ffffff',
    fontSize: '24px',
    fontWeight: 700,
    marginBottom: '16px',
  },
  body: {
    color: '#a0a0a0',
    fontSize: '16px',
    lineHeight: 1.6,
    marginBottom: '16px',
  },
  note: {
    color: '#606060',
    fontSize: '14px',
    lineHeight: 1.5,
  },
  link: {
    color: '#ef4444',
    textDecoration: 'underline',
  },
}
