/**
 * Central Axios instance.
 * - Automatically attaches JWT from localStorage as Authorization header.
 * - On 401 response: clears auth data and redirects to /login.
 */
import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `http://${window.location.hostname}:5000`,
  headers: { 'Content-Type': 'application/json' },
})

// ── Request interceptor — attach JWT ────────────────────────
api.interceptors.request.use(config => {
  const token = localStorage.getItem('jwt_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ── Response interceptor — handle 401 globally ──────────────
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('jwt_token')
      localStorage.removeItem('auth')
      // Hard redirect so all React state is cleared
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(err)
  }
)

export default api
