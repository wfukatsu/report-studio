/**
 * @deprecated Import directly from '@/store' instead.
 *
 * This file is a backward-compatibility shim that re-exports everything
 * from the new slice-based store. All 15+ import sites that reference
 * '@/store/reportStore' will continue to work without modification.
 */

export { useReportStore, selectActivePageId, selectActivePage, selectSelectedElements, flattenPageElements } from './index'
export type { AlignmentType, ZOrderAction } from './types'
