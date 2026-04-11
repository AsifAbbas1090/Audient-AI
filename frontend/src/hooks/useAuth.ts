const AUTH_KEY = 'auth'

export type AuthUser = {
  name:  string
  email: string
}

export function login(name: string, email: string): void {
  const user: AuthUser = { name, email }
  localStorage.setItem(AUTH_KEY, JSON.stringify(user))
}

export function logout(): void {
  localStorage.removeItem(AUTH_KEY)
}

export function isLoggedIn(): boolean {
  return localStorage.getItem(AUTH_KEY) !== null
}

export function getUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY)
    return raw ? (JSON.parse(raw) as AuthUser) : null
  } catch {
    return null
  }
}
