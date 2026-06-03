import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useProfile } from '../hooks/useProfile'
import { SportProvider } from '../sports/SportProvider'

export function ProtectedRoute() {
  const { session, user, loading } = useAuth()
  const { profile } = useProfile(user?.id)

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-teal border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // Don't redirect if URL contains Supabase auth tokens — let AuthCallback handle it
  const hasAuthToken = window.location.hash.includes('access_token') ||
                       window.location.search.includes('code=')
  if (hasAuthToken) return null

  if (!session) return <Navigate to="/login" replace />

  return (
    <SportProvider
      userId={user?.id}
      activeSportSlug={profile?.active_sport}
      sportsEnabled={profile?.sports_enabled}
    >
      <Outlet />
    </SportProvider>
  )
}
