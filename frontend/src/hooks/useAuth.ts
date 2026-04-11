/**
 * Auth helpers — backed by real JWT API.
 * Token stored in localStorage under 'jwt_token'.
 * User profile stored under 'auth' (JSON).
 */
import api from '../lib/api'

export type AuthUser = {
  id:           string
  name:         string
  email:        string
  role:         'healthcare' | 'admin'
  process_mode: 'online' | 'offline'
  created_at?:  string
}

type AuthResponse = {
  token: string
  user:  AuthUser
}

// ── Persist helpers ──────────────────────────────────────────

function persist(token: string, user: AuthUser): void {
  localStorage.setItem('jwt_token', token)
  localStorage.setItem('auth', JSON.stringify(user))
}

// ── API calls ────────────────────────────────────────────────

export async function register(
  name: string,
  email: string,
  password: string,
  role: 'healthcare' | 'admin' = 'healthcare'
): Promise<AuthUser> {
  const res = await api.post<AuthResponse>('/api/auth/register', { name, email, password, role })
  persist(res.data.token, res.data.user)
  return res.data.user
}

export async function login(email: string, password: string): Promise<AuthUser> {
  const res = await api.post<AuthResponse>('/api/auth/login', { email, password })
  persist(res.data.token, res.data.user)
  return res.data.user
}

export async function logout(): Promise<void> {
  try {
    await api.post('/api/auth/logout')
  } catch {
    // Even if the request fails, clear local state
  } finally {
    localStorage.removeItem('jwt_token')
    localStorage.removeItem('auth')
  }
}

// ── Sync helpers (no network call) ───────────────────────────

export function isLoggedIn(): boolean {
  return !!localStorage.getItem('jwt_token')
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem('auth')
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}

export function isAdmin(): boolean {
  return getUser()?.role === 'admin'
}
