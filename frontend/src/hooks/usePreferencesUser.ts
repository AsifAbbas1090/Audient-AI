import { useCallback, useEffect, useState } from 'react'
import api from '../lib/api'
import type { AuthUser } from './useAuth'
import { getUser } from './useAuth'

export const USER_PROFILE_UPDATED = 'user-profile-updated'

/**
 * Loads latest profile (including specialty) from the server once on mount
 * and re-syncs whenever another component dispatches USER_PROFILE_UPDATED.
 * All components share the same localStorage snapshot, so a save in Settings
 * is immediately visible in Sidebar and Dashboard without remounting.
 */
export function usePreferencesUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(() => getUser())

  const fetchProfile = useCallback(() => {
    api
      .get<{ preferences: AuthUser }>('/api/users/me/preferences')
      .then(res => {
        const p = res.data?.preferences
        if (p) {
          localStorage.setItem('auth', JSON.stringify(p))
          setUser(p)
        }
      })
      .catch(() => {
        /* keep local snapshot */
      })
  }, [])

  useEffect(() => {
    fetchProfile()

    const onUpdated = () => {
      // Read the localStorage snapshot first (written by the caller before dispatch)
      // then fire a fresh server fetch to stay in sync.
      const fresh = getUser()
      if (fresh) setUser(fresh)
      fetchProfile()
    }

    window.addEventListener(USER_PROFILE_UPDATED, onUpdated)
    return () => window.removeEventListener(USER_PROFILE_UPDATED, onUpdated)
  }, [fetchProfile])

  return user
}
