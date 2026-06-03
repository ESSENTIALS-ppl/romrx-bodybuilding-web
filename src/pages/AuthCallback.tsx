import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

// Handles the magic link redirect from Supabase.
// Supabase appends access_token/refresh_token to the URL as a hash fragment.
// This component waits for the session to be established, then redirects to the dashboard.
export function AuthCallback() {
  const navigate = useNavigate()

  useEffect(() => {
    // Give Supabase time to parse the URL hash and establish the session
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session) {
        navigate('/dashboard/my-body', { replace: true })
      }
      // If no session after token processing, go to login
      if (event === 'INITIAL_SESSION' && !session) {
        navigate('/login', { replace: true })
      }
    })

    // Also try getting session immediately (handles cases where already processed)
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        navigate('/dashboard/my-body', { replace: true })
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface">
      <div className="text-center space-y-3">
        <div className="w-10 h-10 border-4 border-teal border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-charcoal-light">Signing you in...</p>
      </div>
    </div>
  )
}
