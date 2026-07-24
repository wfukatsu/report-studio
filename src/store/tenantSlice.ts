/**
 * Tenant slice — stores and manages organization-wide tenant information.
 *
 * State is fetched from the backend on app start and updated when the user
 * saves changes in the テナント情報 tab of the DataBindingModal.
 * This slice sits outside the undo/redo history — tenant info is not part
 * of any individual template definition.
 */

import type { StateCreator } from 'zustand'
import type { TenantInfo } from '@/types'
import type { StoreState } from './types'
import { getTenantInfo, putTenantInfo } from '@/api/reportApi'
import { isApiError } from '@/api/client'

export type TenantSlice = Pick<StoreState,
  | 'tenantInfo'
  | 'tenantLoading'
  | 'tenantError'
  | 'fetchTenantInfo'
  | 'updateTenantInfo'
>

export const createTenantSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  TenantSlice
> = (set) => ({
  tenantInfo: null,
  tenantLoading: false,
  tenantError: null,

  fetchTenantInfo: async () => {
    set((s) => { s.tenantLoading = true; s.tenantError = null })
    try {
      const info = await getTenantInfo()
      set((s) => {
        s.tenantInfo = info
        s.tenantLoading = false
      })
    } catch (err) {
      // 401/403 before login is expected (session not established yet) — not an
      // error worth surfacing. Only log/expose genuinely unexpected failures (#433:
      // previously console-only, which left the form silently empty).
      const expectedAuthMiss = isApiError(err) && (err.status === 401 || err.status === 403)
      if (!expectedAuthMiss) {
        console.error('[tenantSlice] fetchTenantInfo failed:', err)
      }
      set((s) => {
        s.tenantLoading = false
        if (!expectedAuthMiss) s.tenantError = err
      })
    }
  },

  updateTenantInfo: async (info: TenantInfo) => {
    const updated = await putTenantInfo(info)
    set((s) => { s.tenantInfo = updated })
  },
})
