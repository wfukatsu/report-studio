/**
 * Store type definitions shared across slices.
 * This file must NOT import from other slice files to avoid circular imports.
 */

import type {
  ReportDefinition,
  PageDef,
  Section,
  ReportElement,
  TextStyle,
  DataSourceDefinition,
  CalculationRule,
  ValidationRule,
  LayerGroup,
  SchemaGroup,
  SchemaField,
  SchemaDefinition,
  SchemaRelation,
  ScalarDbTableMeta,
  OutputVariant,
  MaskingRule,
  TenantInfo,
} from '@/types'
import type { FormResponseSummary } from '@/lib/schemas/formResponse'
import type { Me, UserSummary, UserRole, ServerConfig, SchemaListItem } from '@/api/reportApi'

/**
 * Omit that distributes over union members. Plain `Omit<MaskingRule, 'id'>`
 * collapses the union to its common keys, dropping the per-variant fields
 * (replaceValue / keepFirst / keepLast) from type checking.
 */
type DistributiveOmit<T, K extends keyof T> = T extends unknown ? Omit<T, K> : never

/** addMaskingRule input — a MaskingRule without its id, per union member. */
export type MaskingRuleInput = DistributiveOmit<MaskingRule, 'id'>

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

/** History entry covers page layout, schema, and calculation/validation rules. */
export interface HistoryEntry {
  pages: PageDef[]
  schema?: import('@/types').SchemaDefinition
  calculationRules?: import('@/types').CalculationRule[]
  validationRules?: import('@/types').ValidationRule[]
  /** Captured so page-settings changes (paper size, margins) are undoable (#215). */
  pageSettings?: import('@/types').PageSettings
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

/** Top-level navigation tabs */
export type AppTab = 'design' | 'binding' | 'templates' | 'responses' | 'documents' | 'databrowser' | 'jobs' | 'admin'

/** @deprecated — DataManagementTab replaced by BindingEditor. Kept for migration. */
export type DataSection = 'datasource' | 'schema' | 'calculation' | 'validation' | 'responses' | 'databrowser'

/** Sub-sections within the Template Management tab */
export type TemplateSection = 'templates' | 'variants'

// ---------------------------------------------------------------------------
// Computed slice types (expression evaluation results)
// ---------------------------------------------------------------------------

/** null included: Java null deserializes to JS null */
export type ComputedValue = number | string | boolean | null

/**
 * Phase 2/2.5: resolved ScalarDB data from resolve-bindings endpoint.
 * - master groups → single flat row: Record<fieldKey, value>
 * - detail groups (Phase 2.5) → array of rows: Array<Record<fieldKey, value>>
 * Stored in uiSlice so the export flow can access it.
 */
export type LivePreviewData = Record<
  string,
  Record<string, ComputedValue> | Array<Record<string, ComputedValue>>
>

export interface ValidationViolation {
  ruleKey: string
  message: string
  elementId?: string
}

// ---------------------------------------------------------------------------
// Combined store state + actions interface
// ---------------------------------------------------------------------------

export interface StoreState {
  // ── Auth slice ────────────────────────────────────────────────────────────
  currentUser: Me | null
  authLoading: boolean
  checkAuth: () => Promise<void>
  loginUser: (userId: string, password: string) => Promise<void>
  logoutUser: () => Promise<void>

  // ── Layout slice ─────────────────────────────────────────────────────────
  definition: ReportDefinition
  selection: SelectionState
  /** Flattened test data merged from all dataSources (for expression evaluation) */
  testData: Record<string, unknown>

  // ── History slice ─────────────────────────────────────────────────────────
  history: HistoryEntry[]
  historyIndex: number

  // ── UI slice ──────────────────────────────────────────────────────────────
  /** Active top-level navigation tab */
  activeTab: AppTab
  setActiveTab: (tab: AppTab) => void

  dataActiveSection: DataSection
  setDataActiveSection: (section: DataSection) => void
  templateActiveSection: TemplateSection
  setTemplateActiveSection: (section: TemplateSection) => void

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
  styleClipboard: TextStyle | null
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

  /**
   * Phase 2: resolved ScalarDB data (from resolve-bindings endpoint).
   * null when no live preview has been fetched or schema changed.
   * Not in undo/redo history — transient UI state.
   */
  livePreviewData: LivePreviewData | null
  setLivePreviewData: (data: LivePreviewData | null) => void
  invalidateLivePreviewData: () => void

  // ── Computed slice (expression evaluation — not in undo/redo history) ─────
  computedValues: Record<string, ComputedValue>
  computedErrors: Record<string, string>
  computedViolations: ValidationViolation[]
  computedLoading: boolean

  // ── Layout actions ───────────────────────────────────────────────────────
  setReportName: (name: string) => void
  updateMetadata: (patch: Partial<ReportDefinition['metadata']>) => void
  updateSettings: (settings: Partial<ReportDefinition['pageSettings']>) => void
  updateDefaultTextStyle: (patch: Partial<ReportDefinition['defaultTextStyle']>) => void
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
  copyStyle: (pageId: string, elementId: string) => void
  pasteStyle: (pageId: string, elementIds: string[]) => void

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
  addMaskingRule: (variantId: string, rule: MaskingRuleInput) => void
  removeMaskingRule: (variantId: string, ruleId: string) => void
  replaceMaskingRule: (variantId: string, rule: MaskingRule) => void
  cleanupVariantRefsForElement: (elementId: string) => void

  // ── Schema slice actions ──────────────────────────────────────────────────
  addSchemaGroup: (role: 'master' | 'detail') => void
  removeSchemaGroup: (groupId: string) => void
  updateSchemaGroup: (groupId: string, patch: Partial<Pick<SchemaGroup, 'label' | 'role' | 'dataKey' | 'linkedMasterGroupId'>>) => void
  addSchemaField: (groupId: string, field: Omit<SchemaField, 'id'>) => void
  removeSchemaField: (groupId: string, fieldId: string) => void
  updateSchemaField: (groupId: string, fieldId: string, patch: Partial<Omit<SchemaField, 'id'>>) => void
  /**
   * Bind a SchemaGroup to a ScalarDB table, or unbind it (when tableMeta is undefined).
   *
   * Unbind (`undefined`) atomically clears `tableMeta` AND every field's
   * `dbColumnName` in the group — the entire binding unit is the domain event.
   *
   * Rebind behaviour:
   *  - same `{namespace, tableName}` → preserve all field `dbColumnName` values
   *  - different `{namespace, tableName}` → clear all field `dbColumnName` values,
   *    because none of them can refer to the new table (prevents hostile UX where
   *    every row shows "(列が存在しません)" after rebind)
   */
  bindGroupToTable: (groupId: string, tableMeta: ScalarDbTableMeta | undefined) => void
  /**
   * Phase 1.5 — atomically set `tableMeta` on a group AND assign `dbColumnName`
   * to each listed field in a single immer draft (no N+1 re-renders).
   *
   * `fieldColumns` entries referencing unknown fieldIds are silently ignored.
   * Unlisted fields are left untouched.
   * Does NOT call `pushHistory` — matches the existing `bindGroupToTable` convention.
   */
  bindGroupToTableWithColumns: (
    groupId: string,
    tableMeta: ScalarDbTableMeta,
    fieldColumns: ReadonlyArray<{ fieldId: string; dbColumnName: string }>,
  ) => void
  /** Replace the entire schema definition (used by schema inference). */
  setSchema: (schema: SchemaDefinition) => void
  /** #144: add a named relation object to the schema. */
  addSchemaRelation: (relation: Omit<SchemaRelation, 'id'>) => void
  /** #144: remove a named relation by id. */
  removeSchemaRelation: (relationId: string) => void
  /** #144: patch a named relation's editable fields. */
  updateSchemaRelation: (relationId: string, patch: Partial<Omit<SchemaRelation, 'id'>>) => void
  /**
   * Phase 2: bind an element to a schema field by fieldId, or remove the binding.
   * @param fieldId pass `undefined` to remove the binding
   */
  setElementSchemaBinding: (pageId: string, elementId: string, fieldId: string | undefined) => void
  /** Ensures the __productMaster__ system group exists in the current schema. */
  ensureProductMasterGroup: () => void

  // ── Schema API state & actions ────────────────────────────────────────────
  /** Backend schema ID (null if not yet persisted) */
  schemaId: string | null
  schemaName: string
  schemaVisibility: 'private' | 'shared'
  schemaLoading: boolean
  schemaSaving: boolean
  schemaPendingCreate: boolean
  schemaError: string | null
  schemaUpdatedAt: number | null
  schemaList: SchemaListItem[]

  fetchSchemaList: () => Promise<void>
  loadSchema: (id: string) => Promise<void>
  saveSchema: () => Promise<void>
  deleteSchema: (id: string) => Promise<void>

  // ── Computed slice actions ────────────────────────────────────────────────
  setComputedResults: (payload: {
    results: Record<string, ComputedValue>
    errors: Record<string, string>
  }) => void
  setComputedLoading: (loading: boolean) => void
  setComputedViolations: (violations: ValidationViolation[]) => void
  invalidateComputed: () => void

  // ── Tenant slice ──────────────────────────────────────────────────────────
  tenantInfo: TenantInfo | null
  tenantLoading: boolean
  fetchTenantInfo: () => Promise<void>
  updateTenantInfo: (info: TenantInfo) => Promise<void>

  // ── Product Master slice ──────────────────────────────────────────────────
  products: import('@/types').Product[]
  customFieldDefs: import('@/types').ProductCustomFieldDef[]
  productsLoading: boolean
  productsError: string | null
  productOps: Map<string, 'idle' | 'saving' | 'deleting'>
  fetchProducts: () => Promise<void>
  addProduct: (p: import('@/types').CreateProductRequest) => Promise<import('@/types').Product>
  updateProduct: (id: string, patch: import('@/types').UpdateProductPayload, expectedVersion: number) => Promise<void>
  deleteProduct: (id: string) => Promise<void>
  fetchCustomFieldDefs: () => Promise<void>
  updateCustomFieldDefs: (defs: import('@/types').ProductCustomFieldDef[]) => Promise<void>
  setProductOp: (id: string, op: 'idle' | 'saving' | 'deleting') => void


  // ── Admin slice ───────────────────────────────────────────────────────────
  adminUsers: UserSummary[]
  adminUsersLoading: boolean
  adminUsersError: string | null
  fetchAdminUsers: (signal?: AbortSignal) => Promise<void>
  createAdminUser: (user: { userId: string; displayName?: string; password: string; roles?: UserRole[] }) => Promise<void>
  deleteAdminUser: (userId: string) => Promise<void>

  adminServerConfig: ServerConfig
  adminServerConfigOriginal: ServerConfig
  adminServerConfigLoading: boolean
  adminServerConfigError: string | null
  fetchAdminServerConfig: () => Promise<void>
  setAdminServerConfigField: (key: string, value: string) => void
  saveAdminServerConfig: () => Promise<void>

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
