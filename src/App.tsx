import { Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './components/providers/ThemeProvider'
import { Toaster } from './components/ui/Toaster'
import LandingPage from './pages/LandingPage'
import DashboardPage from './pages/DashboardPage'
import LiveSessionPage from './pages/LiveSessionPage'
import SessionDetailPage from './pages/SessionDetailPage'
import SettingsPage from './pages/SettingsPage'
import AnalyticsPage from './pages/AnalyticsPage'
import ASRPage from './pages/ASRPage'

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/app" element={<DashboardPage />} />
        <Route path="/live" element={<LiveSessionPage />} />
        <Route path="/asr" element={<ASRPage />} />
        <Route path="/session/:id" element={<SessionDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <Toaster />
    </ThemeProvider>
  )
}


