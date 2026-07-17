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

  fetchTenantInfo: async () => {
    set((s) => { s.tenantLoading = true })
    try {
      const info = await getTenantInfo()
      set((s) => {
        s.tenantInfo = info
        s.tenantLoading = false
      })
    } catch (err) {
      // 401/403 before login is expected (session not established yet) — not an
      // error worth surfacing to the console. Only log genuinely unexpected failures.
      if (!(isApiError(err) && (err.status === 401 || err.status === 403))) {
        console.error('[tenantSlice] fetchTenantInfo failed:', err)
      }
      set((s) => { s.tenantLoading = false })
    }
  },

  updateTenantInfo: async (info: TenantInfo) => {
    const updated = await putTenantInfo(info)
    set((s) => { s.tenantInfo = updated })
  },
})
