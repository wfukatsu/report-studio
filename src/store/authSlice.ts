/**
 * Auth slice — tracks the currently authenticated user.
 *
 * State is independent of the template definition (no undo/redo).
 * checkAuth() is called on app mount to restore existing sessions.
 * LoginModal watches: currentUser === null && backendConnected
 */

import type { StateCreator } from 'zustand'
import type { Me, AuthOptions } from '@/api/reportApi'
import { getMe, login, logout } from '@/api/reportApi'
import { navigateTo } from '@/lib/browserNavigation'
import type { StoreState } from './types'

/** What a server that predates #499 implies: password login only. */
const LEGACY_AUTH_OPTIONS: AuthOptions = { localLoginEnabled: true, oidcEnabled: false }

export type AuthSlice = Pick<StoreState,
  | 'currentUser'
  | 'authLoading'
  | 'authOptions'
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
  authOptions: null,

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
        s.authOptions = user.auth ?? LEGACY_AUTH_OPTIONS
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
    set((s) => {
      s.currentUser = user
      if (user.auth) s.authOptions = user.auth
    })
    // Fetch tenant info after login — the initial mount fetch always fails with 401
    // because it runs before authentication. Re-run it now that the session is set.
    await get().fetchTenantInfo()
  },

  logoutUser: async () => {
    let providerLogoutUrl: string | undefined
    try {
      providerLogoutUrl = (await logout())?.logoutUrl
    } finally {
      const prevUserId = get().currentUser?.userId ?? null
      set((s) => { s.currentUser = null })
      // #437: post-logout cleanup is a cross-slice concern — delegated to the
      // orchestration slice so authSlice doesn't own the editing-domain
      // lifecycle. Runs for every logout path (not an App effect) as before.
      get().resetForUserSwitch(prevUserId)
    }
    // OIDC session (#499): also end the Keycloak SSO session (RP-Initiated Logout).
    // Runs after local cleanup so nothing user-scoped survives the full-page navigation.
    if (providerLogoutUrl) navigateTo(providerLogoutUrl)
  },
})

export type { Me }
