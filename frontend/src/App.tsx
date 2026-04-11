import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './components/providers/ThemeProvider'
import { ToastProvider } from './components/ui/Toaster'
import { ProtectedRoute } from './components/ui/ProtectedRoute'

import LandingPage      from './pages/LandingPage'
import LoginPage        from './pages/LoginPage'
import SignupPage       from './pages/SignupPage'
import DashboardPage    from './pages/DashboardPage'
import LiveSessionPage  from './pages/LiveSessionPage'
import ASRPage          from './pages/ASRPage'
import SessionDetailPage from './pages/SessionDetailPage'
import SettingsPage     from './pages/SettingsPage'
import AnalyticsPage    from './pages/AnalyticsPage'

function Protected({ children }: { children: React.ReactNode }) {
  return <ProtectedRoute>{children}</ProtectedRoute>
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Routes>
          {/* Public */}
          <Route path="/"       element={<LandingPage />} />
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Protected */}
          <Route path="/app"          element={<Protected><DashboardPage /></Protected>} />
          <Route path="/live"         element={<Protected><LiveSessionPage /></Protected>} />
          <Route path="/asr"          element={<Protected><ASRPage /></Protected>} />
          <Route path="/session/:id"  element={<Protected><SessionDetailPage /></Protected>} />
          <Route path="/settings"     element={<Protected><SettingsPage /></Protected>} />
          <Route path="/analytics"    element={<Protected><AnalyticsPage /></Protected>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </ThemeProvider>
  )
}
