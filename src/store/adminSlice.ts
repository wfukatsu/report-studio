/**
 * Admin slice — manages admin user list and server config state.
 *
 * Centralizes API calls for user management and server config,
 * following the same pattern as tenantSlice (DIP: components depend
 * on store actions, not API functions directly).
 */

import type { StateCreator } from 'zustand'
import i18n from '@/i18n/config'
import type { StoreState } from './types'
import {
  listUsers, createUser, deleteUser,
  getServerConfig, putServerConfig,
} from '@/api/reportApi'
import type { UserRole } from '@/api/reportApi'

export type AdminSlice = Pick<StoreState,
  | 'adminUsers'
  | 'adminUsersLoading'
  | 'adminUsersError'
  | 'fetchAdminUsers'
  | 'createAdminUser'
  | 'deleteAdminUser'
  | 'adminServerConfig'
  | 'adminServerConfigOriginal'
  | 'adminServerConfigLoading'
  | 'adminServerConfigError'
  | 'fetchAdminServerConfig'
  | 'setAdminServerConfigField'
  | 'saveAdminServerConfig'
>

export const createAdminSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  AdminSlice
> = (set, get) => ({
  adminUsers: [],
  adminUsersLoading: false,
  adminUsersError: null,

  fetchAdminUsers: async (signal?: AbortSignal) => {
    set((s) => { s.adminUsersLoading = true; s.adminUsersError = null })
    try {
      const users = await listUsers(signal)
      if (!signal?.aborted) {
        set((s) => { s.adminUsers = users; s.adminUsersLoading = false })
      }
    } catch (err) {
      // Abort is expected when a newer fetch supersedes this one (e.g. StrictMode
      // double-mount). Guard on the signal itself, not just DOMException/AbortError,
      // because apiFetch may wrap the abort into a generic Error — letting a stale
      // rejection through would paint an error banner over freshly-loaded data (#156).
      if (signal?.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
      set((s) => {
        s.adminUsersError = i18n.t('serverErrors:store.usersLoadFailed')
        s.adminUsersLoading = false
      })
    }
  },

  createAdminUser: async (user: { userId: string; displayName?: string; password: string; roles?: UserRole[] }) => {
    const created = await createUser(user)
    set((s) => { s.adminUsers = [...s.adminUsers, created] })
  },

  deleteAdminUser: async (userId: string) => {
    await deleteUser(userId)
    set((s) => { s.adminUsers = s.adminUsers.filter((u) => u.userId !== userId) })
  },

  adminServerConfig: {},
  adminServerConfigOriginal: {},
  adminServerConfigLoading: false,
  adminServerConfigError: null,

  fetchAdminServerConfig: async () => {
    set((s) => { s.adminServerConfigLoading = true; s.adminServerConfigError = null })
    try {
      const cfg = await getServerConfig()
      set((s) => {
        s.adminServerConfig = cfg
        s.adminServerConfigOriginal = cfg
        s.adminServerConfigLoading = false
      })
    } catch {
      set((s) => {
        s.adminServerConfigError = i18n.t('serverErrors:store.serverConfigLoadFailed')
        s.adminServerConfigLoading = false
      })
    }
  },

  setAdminServerConfigField: (key: string, value: string) => {
    set((s) => { s.adminServerConfig = { ...s.adminServerConfig, [key]: value } })
  },

  saveAdminServerConfig: async () => {
    const config = get().adminServerConfig
    await putServerConfig(config)
    set((s) => { s.adminServerConfigOriginal = config })
  },
})
