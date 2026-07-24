/**
 * Orchestration slice (#437) — cross-slice workflows that no single domain
 * slice should own. Keeps e.g. authSlice from reaching into the editing
 * domain's lifecycle.
 */
import type { StateCreator } from 'zustand'
import type { StoreState } from './types'
import { getAutoSaveKey } from '@/lib/autoSaveKey'

export type OrchestrationSlice = Pick<StoreState, 'resetForUserSwitch'>

export const createOrchestrationSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  OrchestrationSlice
> = (_set, get) => ({
  resetForUserSwitch: (prevUserId) => {
    if (prevUserId === null) return
    // Prevent data leakage between users: drop the previous user's autosave
    // draft and reset the loaded template/report.
    const prevKey = getAutoSaveKey(prevUserId)
    if (prevKey) {
      try { localStorage.removeItem(prevKey) } catch { /* storage disabled */ }
    }
    get().setCurrentTemplateId(null)
    get().newReport()
  },
})
