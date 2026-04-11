import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './components/providers/ThemeProvider'
import { ToastProvider } from './components/ui/Toaster'
import { ProtectedRoute, AdminRoute } from './components/ui/ProtectedRoute'

import LandingPage       from './pages/LandingPage'
import LoginPage         from './pages/LoginPage'
import SignupPage        from './pages/SignupPage'
import DashboardPage     from './pages/DashboardPage'
import LiveSessionPage   from './pages/LiveSessionPage'
import ASRPage           from './pages/ASRPage'
import SessionDetailPage from './pages/SessionDetailPage'
import SettingsPage      from './pages/SettingsPage'
import AnalyticsPage     from './pages/AnalyticsPage'
import AdminPage         from './pages/AdminPage'

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <Routes>
          {/* Public */}
          <Route path="/"       element={<LandingPage />} />
          <Route path="/login"  element={<LoginPage />} />
          <Route path="/signup" element={<SignupPage />} />

          {/* Healthcare + Admin */}
          <Route path="/app"         element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/live"        element={<ProtectedRoute><LiveSessionPage /></ProtectedRoute>} />
          <Route path="/asr"         element={<ProtectedRoute><ASRPage /></ProtectedRoute>} />
          <Route path="/session/:id" element={<ProtectedRoute><SessionDetailPage /></ProtectedRoute>} />
          <Route path="/settings"    element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
          <Route path="/analytics"   element={<ProtectedRoute><AnalyticsPage /></ProtectedRoute>} />

          {/* Admin only */}
          <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </ThemeProvider>
  )
}
