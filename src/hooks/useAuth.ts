import { useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

// Cross-domain SSO hand-off (see sso-contract.md). romrx.io opens this app with
// the Supabase session tokens in the URL fragment. We must consume them and
// establish the session BEFORE the auth guard runs, otherwise the user flashes
// to /login. Returns true if a session was established from the hash.
async function consumeSsoHash(): Promise<boolean> {
  const hash = window.location.hash
  if (!hash || !hash.includes('access_token')) return false

  const params = new URLSearchParams(hash.slice(1))
  const access_token = params.get('access_token')
  const refresh_token = params.get('refresh_token')
  if (!access_token || !refresh_token) return false

  const { error } = await supabase.auth.setSession({ access_token, refresh_token })
  // Strip the tokens from the URL so they don't linger, regardless of outcome.
  history.replaceState(null, '', window.location.pathname + window.location.search)
  if (error) {
    console.warn('SSO hash session hand-off failed:', error.message)
    return false
  }
  return true
}

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    consumeSsoHash()
      .then(() => supabase.auth.getSession())
      .then(({ data }) => {
        setSession(data.session)
        setUser(data.session?.user ?? null)
        setLoading(false)
      })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return { session, user, loading, signOut }
}
