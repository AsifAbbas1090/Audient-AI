import { Navigate } from 'react-router-dom'
import { isLoggedIn, isAdmin } from '../../hooks/useAuth'

/** Redirects to /login if not authenticated. */
export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  return <>{children}</>
}

/** Redirects to /login if not authenticated, or /app if not admin. */
export function AdminRoute({ children }: { children: React.ReactNode }) {
  if (!isLoggedIn()) {
    return <Navigate to="/login" replace />
  }
  if (!isAdmin()) {
    return <Navigate to="/app" replace />
  }
  return <>{children}</>
}
