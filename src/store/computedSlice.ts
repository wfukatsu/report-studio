/**
 * Computed slice — expression evaluation results integrated as part of the main store.
 *
 * NOT included in undo/redo history (historySlice only snapshots `pages`).
 * Separate `create()` instance avoided: a second store causes stale values after undo.
 *
 * Actions:
 * - setComputedResults   — called when evaluation API responds
 * - setComputedLoading   — called before firing API request
 * - setComputedViolations — called when validation API responds
 * - invalidateComputed   — resets all computed state (e.g. on template load or element delete)
 */
import type { StateCreator } from 'zustand'
import type { StoreState, ComputedValue, ValidationViolation } from './types'

export type ComputedSlice = Pick<StoreState,
  | 'computedValues'
  | 'computedErrors'
  | 'computedViolations'
  | 'computedLoading'
  | 'setComputedResults'
  | 'setComputedLoading'
  | 'setComputedViolations'
  | 'invalidateComputed'
>

export const createComputedSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  ComputedSlice
> = (set) => ({
  computedValues: {} as Record<string, ComputedValue>,
  computedErrors: {} as Record<string, string>,
  computedViolations: [] as ValidationViolation[],
  computedLoading: false,

  setComputedResults: ({ results, errors }) => set((s) => {
    s.computedValues = results
    s.computedErrors = errors
    // loading is managed by the caller (useEvaluator finally block)
  }),

  setComputedLoading: (loading) => set((s) => { s.computedLoading = loading }),

  setComputedViolations: (violations) => set((s) => { s.computedViolations = violations }),

  invalidateComputed: () => set((s) => {
    s.computedValues = {}
    s.computedErrors = {}
    s.computedViolations = []
    s.computedLoading = false
  }),
})
