/**
 * Store type definitions shared across slices.
 * This file must NOT import from other slice files to avoid circular imports.
 */

import type {
  ReportDefinition,
  PageDef,
  Section,
  ReportElement,
  DataSourceDefinition,
  CalculationRule,
  ValidationRule,
  LayerGroup,
  SchemaGroup,
  SchemaField,
  SchemaDefinition,
  OutputVariant,
  MaskingRule,
} from '@/types'
import type { FormResponseSummary } from '@/lib/schemas/formResponse'

// ---------------------------------------------------------------------------
// Alignment / Z-order enums (moved from reportStore for shared use)
// ---------------------------------------------------------------------------

export type AlignmentType =
  | 'left' | 'centerH' | 'right'
  | 'top' | 'centerV' | 'bottom'
  | 'distributeH' | 'distributeV'

export type ZOrderAction = 'front' | 'back' | 'forward' | 'backward'

// ---------------------------------------------------------------------------
// History
// ---------------------------------------------------------------------------

/** History entry covers page layout only (no dataSources or calculationRules) */
export interface HistoryEntry {
  pages: PageDef[]
}

// ---------------------------------------------------------------------------
// Selection state
// ---------------------------------------------------------------------------

export interface SelectionState {
  selectedElementIds: string[]
  activePageId: string | null
}

// ---------------------------------------------------------------------------
// Backend / connection state types
// ---------------------------------------------------------------------------

export type LoadState = 'idle' | 'loading' | 'error'
export type SaveState = 'idle' | 'saving' | 'saved' | 'error'

// ---------------------------------------------------------------------------
// Computed slice types (expression evaluation results)
// ---------------------------------------------------------------------------

/** null included: Java null deserializes to JS null */
export type ComputedValue = number | string | boolean | null

export interface ValidationViolation {
  ruleKey: string
  message: string
  elementId?: string
}

// ---------------------------------------------------------------------------
// Combined store state + actions interface
// ---------------------------------------------------------------------------

export interface StoreState {
  // ── Layout slice ─────────────────────────────────────────────────────────
  definition: ReportDefinition
  selection: SelectionState
  /** Flattened test data merged from all dataSources (for expression evaluation) */
  testData: Record<string, unknown>

  // ── History slice ─────────────────────────────────────────────────────────
  history: HistoryEntry[]
  historyIndex: number

  // ── UI slice ──────────────────────────────────────────────────────────────
  previewMode: boolean
  /** Editor canvas zoom (set independently or together via setZoom) */
  editorZoom: number
  /** Live-preview canvas zoom (set independently or together via setZoom) */
  previewZoom: number
  showGrid: boolean
  snapToGrid: boolean
  showTrimMarks: boolean
  showMarginGuide: boolean
  gridSize: number
  clipboard: ReportElement[] | null
  headerEditMode: boolean
  livePreviewEnabled: boolean
  /** V1 backend connection status */
  backendConnected: boolean
  /** ID of the currently loaded template (null when in local-only mode) */
  currentTemplateId: string | null
  /** Search query for the LayersPanel filter (persisted across panel remounts) */
  layerSearchQuery: string
  /** State of the in-progress template load */
  loadState: LoadState
  /** State of the most recent auto-save attempt */
  saveState: SaveState
  /** Monotonically increasing counter to detect concurrent loads (stored in store, not module scope) */
  loadGeneration: number

  // ── Computed slice (expression evaluation — not in undo/redo history) ─────
  computedValues: Record<string, ComputedValue>
  computedErrors: Record<string, string>
  computedViolations: ValidationViolation[]
  computedLoading: boolean

  // ── Layout actions ───────────────────────────────────────────────────────
  setReportName: (name: string) => void
  updateMetadata: (patch: Partial<ReportDefinition['metadata']>) => void
  updateSettings: (settings: Partial<ReportDefinition['pageSettings']>) => void
  setDataSource: (dataSource: DataSourceDefinition | null) => void
  loadReport: (report: ReportDefinition) => void
  loadLegacyReport: (report: import('@/types').Report) => void
  newReport: () => void
  exportReportJSON: () => string
  importReportJSON: (json: string) => { ok: boolean; error?: string }

  addPage: (name?: string) => void
  removePage: (pageId: string) => void
  renamePage: (pageId: string, name: string) => void
  updatePageBackground: (pageId: string, background: string) => void
  setActivePage: (pageId: string) => void

  updateSectionHeight: (pageId: string, sectionId: string, heightMm: number) => void
  updateTestData: (dataSourceId: string, fieldKey: string, value: unknown) => void
  addElement: (pageId: string, element: ReportElement, sectionId?: string) => void
  updateElement: (pageId: string, elementId: string, patch: Partial<ReportElement>) => void
  removeElement: (pageId: string, elementId: string) => void
  moveElement: (pageId: string, elementId: string, position: { x: number; y: number }) => void
  resizeElement: (pageId: string, elementId: string, size: { width: number; height: number }) => void
  duplicateElement: (pageId: string, elementId: string) => void
  alignElements: (pageId: string, elementIds: string[], alignment: AlignmentType) => void
  setZOrder: (pageId: string, elementId: string, order: ZOrderAction) => void

  copyElements: (pageId: string, elementIds: string[]) => void
  pasteElements: (pageId: string) => void
  cutElements: (pageId: string, elementIds: string[]) => void

  // Group layer actions
  addLayerGroup: (pageId: string, group: LayerGroup) => void
  removeLayerGroup: (pageId: string, groupId: string) => void
  updateLayerGroup: (pageId: string, groupId: string, patch: Partial<Pick<LayerGroup, 'name' | 'collapsed' | 'visible' | 'locked'>>) => void
  /** Group the currently selected elements into a new LayerGroup */
  groupSelectedElements: (pageId: string, name?: string) => void
  /** Remove a single element from its group (individual leave, not group dissolve) */
  leaveGroup: (pageId: string, elementId: string) => void

  // Batch element actions
  reorderElements: (pageId: string, sectionId: string, orderedIds: string[]) => void
  updateElements: (pageId: string, elementIds: string[], patch: Partial<ReportElement>) => void
  removeElements: (pageId: string, elementIds: string[]) => void

  selectElement: (elementId: string, multi?: boolean) => void
  clearSelection: () => void
  selectAll: (pageId: string) => void
  setSelectionIds: (ids: string[]) => void
  setMasterHeader: (section: Section | null) => void
  setMasterFooter: (section: Section | null) => void

  // ── Rules actions ─────────────────────────────────────────────────────────
  addCalculationRule: (rule: CalculationRule) => void
  updateCalculationRule: (key: string, patch: Partial<CalculationRule>) => void
  removeCalculationRule: (key: string) => void

  addValidationRule: (rule: ValidationRule) => void
  updateValidationRule: (id: string, patch: Partial<ValidationRule>) => void
  removeValidationRule: (id: string) => void

  // ── History actions ───────────────────────────────────────────────────────
  undo: () => void
  redo: () => void
  pushHistory: () => void

  // ── UI actions ────────────────────────────────────────────────────────────
  setPreviewMode: (enabled: boolean) => void
  /** Set both editor and preview zoom simultaneously (used by toolbar) */
  setZoom: (zoom: number) => void
  /** Set only the editor canvas zoom */
  setEditorZoom: (zoom: number) => void
  /** Set only the live-preview canvas zoom */
  setPreviewZoom: (zoom: number) => void
  toggleGrid: () => void
  toggleSnapToGrid: () => void
  toggleTrimMarks: () => void
  toggleMarginGuide: () => void
  toggleHeaderEditMode: () => void
  toggleLivePreview: () => void
  setHeaderEditMode: (enabled: boolean) => void
  setLivePreviewEnabled: (enabled: boolean) => void
  setBackendConnected: (connected: boolean) => void
  setCurrentTemplateId: (id: string | null) => void
  setLoadState: (state: LoadState) => void
  setSaveState: (state: SaveState) => void
  incrementLoadGeneration: () => void
  setLayerSearchQuery: (query: string) => void

  // ── Variants slice actions ────────────────────────────────────────────────
  addVariant: (name: string) => void
  removeVariant: (variantId: string) => void
  updateVariant: (variantId: string, patch: Partial<Pick<OutputVariant, 'name' | 'targetAudience'>>) => void
  toggleElementHidden: (variantId: string, elementId: string) => void
  addMaskingRule: (variantId: string, rule: Omit<MaskingRule, 'id'>) => void
  removeMaskingRule: (variantId: string, ruleId: string) => void
  replaceMaskingRule: (variantId: string, rule: MaskingRule) => void
  cleanupVariantRefsForElement: (elementId: string) => void

  // ── Schema slice actions ──────────────────────────────────────────────────
  addSchemaGroup: (role: 'master' | 'detail') => void
  removeSchemaGroup: (groupId: string) => void
  updateSchemaGroup: (groupId: string, patch: Partial<Pick<SchemaGroup, 'label' | 'role' | 'dataKey'>>) => void
  addSchemaField: (groupId: string, field: Omit<SchemaField, 'id'>) => void
  removeSchemaField: (groupId: string, fieldId: string) => void
  updateSchemaField: (groupId: string, fieldId: string, patch: Partial<Omit<SchemaField, 'id'>>) => void
  /** Replace the entire schema definition (used by schema inference). */
  setSchema: (schema: SchemaDefinition) => void

  // ── Computed slice actions ────────────────────────────────────────────────
  setComputedResults: (payload: {
    results: Record<string, ComputedValue>
    errors: Record<string, string>
  }) => void
  setComputedLoading: (loading: boolean) => void
  setComputedViolations: (violations: ValidationViolation[]) => void
  invalidateComputed: () => void

  // ── Responses slice ───────────────────────────────────────────────────────
  responses: FormResponseSummary[]
  responsesTotal: number
  /** Epoch ms of last successful responses fetch. 0 = cache miss. */
  responsesCacheTime: number
  responsesLoading: boolean
  submitResponseModalOpen: boolean
  setResponses: (items: FormResponseSummary[], total: number) => void
  setResponsesLoading: (v: boolean) => void
  invalidateResponsesCache: () => void
  openSubmitResponseModal: () => void
  closeSubmitResponseModal: () => void
}
