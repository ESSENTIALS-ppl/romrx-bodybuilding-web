import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { Layout } from './components/Layout'
import { Login } from './pages/Login'
import { AuthCallback } from './pages/AuthCallback'
import { AuthConfirm } from './pages/AuthConfirm'
import { Signup } from './pages/Signup'
import { Assessment } from './pages/Assessment'
import { MyBody } from './pages/MyBody'
import { MyGame } from './pages/MyGame'
import { MyProtocol } from './pages/MyProtocol'
import { WorkoutLogger } from './pages/WorkoutLogger'
import { PRTracker } from './pages/PRTracker'
import { BodyMetrics } from './pages/BodyMetrics'
import { Chat } from './pages/Chat'
import { Settings } from './pages/Settings'
import { CoachDashboard } from './pages/CoachDashboard'
import { CoachSignup } from './pages/CoachSignup'
import { MyCoach } from './pages/MyCoach'
import { MySchool } from './pages/MySchool'
import { ResultsPreview } from './pages/ResultsPreview'
import { Unsubscribe } from './pages/Unsubscribe'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login"          element={<Login />} />
        <Route path="/signup"          element={<Signup />} />
        <Route path="/signup/coach"     element={<CoachSignup />} />
        <Route path="/auth/callback"   element={<AuthCallback />} />
        <Route path="/auth/confirm"    element={<AuthConfirm />} />
        <Route path="/onboarding/assessment" element={<Assessment />} />
        <Route path="/onboarding/results"    element={<ResultsPreview />} />
        <Route path="/unsubscribe"     element={<Unsubscribe />} />

        {/* / is handled by Netlify rewrite to marketing.html — this catches any edge case */}
        <Route path="/" element={null} />

        {/* Protected dashboard routes under /dashboard/* */}
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/dashboard/my-body"     element={<MyBody />} />
            <Route path="/dashboard/my-game"     element={<MyGame />} />
            <Route path="/dashboard/my-protocol" element={<MyProtocol />} />
            <Route path="/dashboard/workout"     element={<WorkoutLogger />} />
            <Route path="/dashboard/prs"         element={<PRTracker />} />
            <Route path="/dashboard/body"        element={<BodyMetrics />} />
            <Route path="/dashboard/chat"        element={<Chat />} />
            <Route path="/dashboard/settings"    element={<Settings />} />
            <Route path="/dashboard/coach"             element={<CoachDashboard defaultSection="team" />} />
            <Route path="/dashboard/coach-coaching"    element={<CoachDashboard defaultSection="coaching" />} />
            <Route path="/dashboard/coach-competitions" element={<CoachDashboard defaultSection="competitions" />} />
            <Route path="/dashboard/coach-injury"      element={<CoachDashboard defaultSection="injury" />} />
            <Route path="/dashboard/coach-school"      element={<CoachDashboard defaultSection="school" />} />
            <Route path="/dashboard/my-coach"     element={<MyCoach />} />
            <Route path="/dashboard/my-school"    element={<MySchool />} />
          </Route>
        </Route>

        {/* Legacy redirects — old /my-body etc. -> /dashboard/my-body */}
        <Route path="/my-body"     element={<Navigate to="/dashboard/my-body"     replace />} />
        <Route path="/my-game"     element={<Navigate to="/dashboard/my-game"     replace />} />
        <Route path="/my-protocol" element={<Navigate to="/dashboard/my-protocol" replace />} />
        <Route path="/chat"        element={<Navigate to="/dashboard/chat"        replace />} />
        <Route path="/settings"    element={<Navigate to="/dashboard/settings"    replace />} />
      </Routes>
    </BrowserRouter>
  )
}
