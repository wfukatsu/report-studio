/**
 * Auth slice — tracks the currently authenticated user.
 *
 * State is independent of the template definition (no undo/redo).
 * checkAuth() is called on app mount to restore existing sessions.
 * LoginModal watches: currentUser === null && backendConnected
 */

import type { StateCreator } from 'zustand'
import type { Me } from '@/api/reportApi'
import { getMe, login, logout } from '@/api/reportApi'
import type { StoreState } from './types'

export type AuthSlice = Pick<StoreState,
  | 'currentUser'
  | 'authLoading'
  | 'checkAuth'
  | 'loginUser'
  | 'logoutUser'
>

export const createAuthSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  AuthSlice
> = (set, get) => ({
  currentUser: null,
  authLoading: true,

  /**
   * Check existing session on app mount.
   * 200 → set currentUser (session valid)
   * 401 → currentUser = null (not authenticated; LoginModal will appear if backendConnected)
   * network error → currentUser = null (backend down; LoginModal stays hidden)
   */
  checkAuth: async () => {
    set((s) => { s.authLoading = true })
    try {
      const user = await getMe()
      // anonymous=true means the server resolved no valid session
      const authenticated = !user.anonymous
      set((s) => {
        s.currentUser = authenticated ? user : null
        s.authLoading = false
      })
      // Fetch tenant info only after a valid session is confirmed, mirroring
      // loginUser. Fetching before this point is a guaranteed 401.
      if (authenticated) await get().fetchTenantInfo()
    } catch {
      // 401 = unauthenticated; anything else = network/server error
      set((s) => {
        s.currentUser = null
        s.authLoading = false
      })
    }
  },

  loginUser: async (userId: string, password: string) => {
    const user = await login(userId, password)
    set((s) => { s.currentUser = user })
    // Fetch tenant info after login — the initial mount fetch always fails with 401
    // because it runs before authentication. Re-run it now that the session is set.
    await get().fetchTenantInfo()
  },

  logoutUser: async () => {
    try {
      await logout()
    } finally {
      set((s) => { s.currentUser = null })
    }
  },
})

export type { Me }
