/**
 * Responses slice — form response list state with 5-minute TTL cache.
 *
 * Cache invalidation:
 * - Expires after 5 minutes (CACHE_TTL_MS)
 * - Explicitly invalidated after submit or delete via invalidateResponsesCache()
 * - templateId change implicitly invalidates (checked in consumers)
 */

import type { StateCreator } from 'zustand'
import type { StoreState } from './types'

export const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

export type ResponsesSlice = Pick<StoreState,
  | 'responses'
  | 'responsesTotal'
  | 'responsesCacheTime'
  | 'responsesLoading'
  | 'submitResponseModalOpen'
  | 'setResponses'
  | 'setResponsesLoading'
  | 'invalidateResponsesCache'
  | 'openSubmitResponseModal'
  | 'closeSubmitResponseModal'
>

export const createResponsesSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  ResponsesSlice
> = (set) => ({
  responses: [],
  responsesTotal: 0,
  responsesCacheTime: 0,
  responsesLoading: false,
  submitResponseModalOpen: false,

  setResponses: (items, total) => set((s) => {
    s.responses = items
    s.responsesTotal = total
    s.responsesCacheTime = Date.now()
  }),

  setResponsesLoading: (v) => set((s) => { s.responsesLoading = v }),

  invalidateResponsesCache: () => set((s) => { s.responsesCacheTime = 0 }),

  openSubmitResponseModal: () => set((s) => { s.submitResponseModalOpen = true }),

  closeSubmitResponseModal: () => set((s) => { s.submitResponseModalOpen = false }),
})
