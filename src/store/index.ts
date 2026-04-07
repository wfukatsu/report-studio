/**
 * Combined Zustand store — composes all slices into a single store instance.
 *
 * Import `useReportStore` from here (or from the `reportStore` shim).
 * Import selectors from `./selectors`.
 */

import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { StoreState } from './types'
import { createLayoutSlice } from './layoutSlice'
import { createRulesSlice } from './rulesSlice'
import { createHistorySlice, snapshotPages } from './historySlice'
import { createUISlice } from './uiSlice'
import { createComputedSlice } from './computedSlice'
import { createSchemaSlice } from './schemaSlice'
import { createVariantsSlice } from './variantsSlice'
import { createResponsesSlice } from './responsesSlice'
import { createDefaultDefinition } from './layoutSlice'

// Build the combined store
export const useReportStore = create<StoreState>()(
  immer((...a) => {
    const layout = createLayoutSlice(...a)
    const rules = createRulesSlice(...a)
    const history = createHistorySlice(...a)
    const ui = createUISlice(...a)
    const computed = createComputedSlice(...a)
    const schema = createSchemaSlice(...a)
    const variants = createVariantsSlice(...a)
    const responses = createResponsesSlice(...a)

    // Initialize history with the default definition's initial pages
    const initialHistory = [snapshotPages(createDefaultDefinition().pages)]

    return {
      ...layout,
      ...rules,
      ...history,
      ...ui,
      ...computed,
      ...schema,
      ...variants,
      ...responses,
      // Override initial history state with populated snapshot
      history: initialHistory,
      historyIndex: 0,
    }
  }),
)

// Re-export selectors and types for convenience
export { selectActivePageId, selectActivePage, selectSelectedElements, flattenPageElements } from './selectors'
export type { AlignmentType, ZOrderAction } from './types'
