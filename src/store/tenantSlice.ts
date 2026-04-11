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
      console.error('[tenantSlice] fetchTenantInfo failed:', err)
      set((s) => { s.tenantLoading = false })
    }
  },

  updateTenantInfo: async (info: TenantInfo) => {
    const updated = await putTenantInfo(info)
    set((s) => { s.tenantInfo = updated })
  },
})
