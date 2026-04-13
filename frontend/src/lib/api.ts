/**
 * Central Axios instance.
 *
 * With Vite proxy configured, all /api/* requests go to the same origin
 * (Vite dev server → proxied to Flask on :5000), so cookies flow naturally.
 *
 * Refresh token flow:
 *   1. Access token expires → server returns 401
 *   2. Interceptor calls POST /api/auth/refresh (sends httpOnly cookie)
 *   3. Server issues a new access token
 *   4. Original request retried with new token
 *   5. All requests that arrived during the refresh are queued and replayed
 *
 * If /api/auth/refresh itself fails → clear storage and redirect to /login.
 */
import axios, { type InternalAxiosRequestConfig } from 'axios'

// Use relative URL in dev (Vite proxy handles routing to :5000).
// Override with VITE_API_URL in production (e.g. https://api.myapp.com).
const BASE_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? ''

const api = axios.create({
  baseURL:         BASE_URL,
  headers:         { 'Content-Type': 'application/json' },
  withCredentials: true,   // send httpOnly refresh_token cookie on every request
})

// ── Queue of requests waiting for a token refresh ─────────────────────────
type QueueEntry = {
  resolve: (token: string) => void
  reject:  (err: unknown) => void
}
let isRefreshing  = false
let failedQueue: QueueEntry[] = []

function drainQueue(err: unknown, newToken: string | null) {
  failedQueue.forEach(({ resolve, reject }) =>
    err ? reject(err) : resolve(newToken!)
  )
  failedQueue = []
}

// ── Request interceptor — attach JWT ─────────────────────────────────────
api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = localStorage.getItem('jwt_token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// ── Response interceptor — handle 401 with refresh retry ─────────────────
api.interceptors.response.use(
  res => res,
  async (err) => {
    const original = err.config as InternalAxiosRequestConfig & { _retry?: boolean }

    // Only intercept 401s that are NOT from the refresh endpoint itself
    // (prevents an infinite retry loop when the refresh token is also expired).
    if (
      err.response?.status === 401 &&
      !original._retry &&
      !original.url?.includes('/api/auth/refresh')
    ) {
      if (isRefreshing) {
        // Another refresh is already in flight — queue this request
        return new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject })
        }).then(token => {
          original.headers.Authorization = `Bearer ${token}`
          return api(original)
        }).catch(e => Promise.reject(e))
      }

      original._retry = true
      isRefreshing    = true

      try {
        // Call /refresh — Flask reads the httpOnly cookie and issues a new token
        const res      = await axios.post(
          `${BASE_URL}/api/auth/refresh`,
          {},
          { withCredentials: true },
        )
        const newToken = res.data.token as string
        localStorage.setItem('jwt_token', newToken)
        api.defaults.headers.common.Authorization = `Bearer ${newToken}`
        drainQueue(null, newToken)
        original.headers.Authorization = `Bearer ${newToken}`
        return api(original)
      } catch (refreshErr) {
        drainQueue(refreshErr, null)
        localStorage.removeItem('jwt_token')
        localStorage.removeItem('auth')
        if (window.location.pathname !== '/login') {
          window.location.href = '/login'
        }
        return Promise.reject(refreshErr)
      } finally {
        isRefreshing = false
      }
    }

    return Promise.reject(err)
  },
)

export default api
