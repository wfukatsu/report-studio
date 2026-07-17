/**
 * Schema slice — SchemaDefinition CRUD (groups + fields).
 * Schema lives on definition but is not in undo/redo history (same as calculationRules).
 */

import type { StateCreator } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { SchemaGroup, SchemaField } from '@/types'
import type { StoreState } from './types'
import { listSchemas, getSchema, createSchema, updateSchema, deleteSchema as deleteSchemaApi } from '@/api/reportApi'
import { isApiError } from '@/api/client'

// ---------------------------------------------------------------------------
// System group constants
// ---------------------------------------------------------------------------

/** ID of the product master system group — must match backend constant */
export const SYSTEM_GROUP_PRODUCT_MASTER = '__productMaster__'

/** Returns true for system-reserved group IDs (double-underscore pattern). */
export function isSystemGroup(id: string): boolean {
  return id === SYSTEM_GROUP_PRODUCT_MASTER
}

/** Stable field IDs for the product master system group (hardcoded for binding stability). */
const PRODUCT_MASTER_FIELD_IDS = {
  id: 'pm-field-id-00000000-0000-0000-0000-000000000001',
  code: 'pm-field-id-00000000-0000-0000-0000-000000000002',
  name: 'pm-field-id-00000000-0000-0000-0000-000000000003',
  unitPrice: 'pm-field-id-00000000-0000-0000-0000-000000000004',
  category: 'pm-field-id-00000000-0000-0000-0000-000000000005',
  description: 'pm-field-id-00000000-0000-0000-0000-000000000006',
  stockCount: 'pm-field-id-00000000-0000-0000-0000-000000000007',
  taxType: 'pm-field-id-00000000-0000-0000-0000-000000000008',
  unit: 'pm-field-id-00000000-0000-0000-0000-000000000009',
  manufacturer: 'pm-field-id-00000000-0000-0000-0000-000000000010',
} as const

function buildProductMasterGroup(): SchemaGroup {
  return {
    id: SYSTEM_GROUP_PRODUCT_MASTER,
    label: '商品マスター',
    role: 'master',
    dataKey: '__productMaster__',
    fields: [
      { id: PRODUCT_MASTER_FIELD_IDS.id, key: 'id', label: '商品ID', type: 'string' },
      { id: PRODUCT_MASTER_FIELD_IDS.code, key: 'code', label: '商品コード', type: 'string' },
      { id: PRODUCT_MASTER_FIELD_IDS.name, key: 'name', label: '商品名', type: 'string' },
      { id: PRODUCT_MASTER_FIELD_IDS.unitPrice, key: 'unitPrice', label: '単価', type: 'number' },
      { id: PRODUCT_MASTER_FIELD_IDS.category, key: 'category', label: 'カテゴリ', type: 'string' },
      { id: PRODUCT_MASTER_FIELD_IDS.description, key: 'description', label: '説明', type: 'string' },
      { id: PRODUCT_MASTER_FIELD_IDS.stockCount, key: 'stockCount', label: '在庫数', type: 'number' },
      { id: PRODUCT_MASTER_FIELD_IDS.taxType, key: 'taxType', label: '税区分', type: 'string' },
      { id: PRODUCT_MASTER_FIELD_IDS.unit, key: 'unit', label: '単位', type: 'string' },
      { id: PRODUCT_MASTER_FIELD_IDS.manufacturer, key: 'manufacturer', label: 'メーカー', type: 'string' },
    ],
  }
}

export type SchemaSlice = Pick<StoreState,
  | 'addSchemaGroup'
  | 'removeSchemaGroup'
  | 'updateSchemaGroup'
  | 'addSchemaField'
  | 'removeSchemaField'
  | 'updateSchemaField'
  | 'bindGroupToTable'
  | 'bindGroupToTableWithColumns'
  | 'setSchema'
  | 'setElementSchemaBinding'
  | 'ensureProductMasterGroup'
  | 'schemaId'
  | 'schemaName'
  | 'schemaVisibility'
  | 'schemaLoading'
  | 'schemaSaving'
  | 'schemaPendingCreate'
  | 'schemaError'
  | 'schemaUpdatedAt'
  | 'schemaList'
  | 'fetchSchemaList'
  | 'loadSchema'
  | 'saveSchema'
  | 'deleteSchema'
>

// Stale-fetch guard (module-level, following productSlice pattern)
let _fetchSeq = 0

export const createSchemaSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  SchemaSlice
> = (set, get) => ({
  // ── Schema API state (initial values) ───────────────────────────────────
  schemaId: null,
  schemaName: '',
  schemaVisibility: 'private' as const,
  schemaLoading: false,
  schemaSaving: false,
  schemaPendingCreate: false,
  schemaError: null,
  schemaUpdatedAt: null,
  schemaList: [],

  // ── Schema API async actions ────────────────────────────────────────────

  fetchSchemaList: async () => {
    const seq = ++_fetchSeq
    set((s) => { s.schemaLoading = true; s.schemaError = null })
    try {
      const result = await listSchemas()
      if (_fetchSeq !== seq) return // stale response guard
      set((s) => { s.schemaList = result.items; s.schemaLoading = false })
    } catch (err) {
      if (_fetchSeq !== seq) return
      set((s) => {
        s.schemaLoading = false
        s.schemaError = err instanceof Error ? err.message : 'スキーマの読み込みに失敗しました'
      })
    }
  },

  loadSchema: async (id: string) => {
    set((s) => { s.schemaLoading = true; s.schemaError = null })
    try {
      const envelope = await getSchema(id)
      set((s) => {
        s.schemaId = envelope.id
        s.schemaName = envelope.name
        s.schemaVisibility = envelope.visibility
        s.schemaUpdatedAt = envelope.updatedAt
        s.definition.schema = envelope.definition as StoreState['definition']['schema']
        s.schemaLoading = false
      })
    } catch (err) {
      set((s) => {
        s.schemaLoading = false
        s.schemaError = err instanceof Error ? err.message : 'スキーマの読み込みに失敗しました'
      })
    }
  },

  saveSchema: async () => {
    const state = get()
    if (state.schemaPendingCreate) return // POST in-flight, skip
    if (state.schemaSaving) return // prevent concurrent saves

    const definition = state.definition.schema ?? { groups: [] }
    set((s) => { s.schemaSaving = true })

    try {
      if (state.schemaId) {
        // Existing schema — PUT with optimistic lock
        const res = await updateSchema(state.schemaId, {
          name: state.schemaName || '新しいスキーマ',
          visibility: state.schemaVisibility,
          definition,
          updatedAt: state.schemaUpdatedAt,
        })
        set((s) => { s.schemaUpdatedAt = res.updatedAt })
      } else {
        // New schema — POST
        set((s) => { s.schemaPendingCreate = true })
        const res = await createSchema(
          state.schemaName || '新しいスキーマ',
          definition,
          state.schemaVisibility,
        )
        set((s) => {
          s.schemaId = res.id
          s.schemaUpdatedAt = res.updatedAt
        })
      }
    } catch (err) {
      if (isApiError(err) && err.status === 409) {
        throw new Error('他のユーザーがこのスキーマを更新しました。再読み込みしてください。')
      }
      throw err // caller (UI hook) handles toast
    } finally {
      set((s) => { s.schemaSaving = false; s.schemaPendingCreate = false })
    }
  },

  deleteSchema: async (id: string) => {
    await deleteSchemaApi(id)
    set((s) => {
      s.schemaList = s.schemaList.filter(item => item.id !== id)
      if (s.schemaId === id) {
        s.schemaId = null
        s.schemaName = ''
        s.schemaUpdatedAt = null
      }
    })
  },

  // ── Schema local actions ────────────────────────────────────────────────

  addSchemaGroup: (role) => set((s) => {
    if (!s.definition.schema) {
      s.definition.schema = { groups: [] }
    }
    const group: SchemaGroup = {
      id: uuidv4(),
      label: role === 'master' ? 'マスター' : '明細',
      role,
      dataKey: '',
      fields: [],
    }
    s.definition.schema.groups.push(group)
  }),

  removeSchemaGroup: (groupId) => {
    set((s) => {
      if (!s.definition.schema) return
      if (isSystemGroup(groupId)) return  // system groups cannot be removed
      const group = s.definition.schema.groups.find((g) => g.id === groupId)
      if (!group) return
      // Collect field IDs before removing the group (immer-safe: build Set outside draft ops)
      const removedFieldIds = new Set(group.fields.map((f) => f.id))
      s.definition.schema.groups = s.definition.schema.groups.filter((g) => g.id !== groupId)
      // Clear schemaBinding on elements that referenced any field in this group
      for (const page of s.definition.pages) {
        for (const section of page.sections ?? []) {
          for (const el of section.elements) {
            if (el.schemaBinding && removedFieldIds.has(el.schemaBinding.fieldId)) {
              el.schemaBinding = undefined
            }
          }
        }
      }
    })
    get().invalidateLivePreviewData()
  },

  updateSchemaGroup: (groupId, patch) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    Object.assign(group, patch)
  }),

  addSchemaField: (groupId, field) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return
    const newField: SchemaField = { ...field, id: uuidv4() }
    group.fields.push(newField)
  }),

  removeSchemaField: (groupId, fieldId) => {
    set((s) => {
      const group = s.definition.schema?.groups.find((g) => g.id === groupId)
      if (!group) return
      group.fields = group.fields.filter((f) => f.id !== fieldId)
      // Clear schemaBinding on elements that referenced this field (atomic in same set())
      const targetFieldId = fieldId
      for (const page of s.definition.pages) {
        for (const section of page.sections ?? []) {
          for (const el of section.elements) {
            if (el.schemaBinding?.fieldId === targetFieldId) {
              el.schemaBinding = undefined
            }
          }
        }
      }
    })
    get().invalidateLivePreviewData()
  },

  updateSchemaField: (groupId, fieldId, patch) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    const field = group?.fields.find((f) => f.id === fieldId)
    if (!field) return
    Object.assign(field, patch)
  }),

  bindGroupToTable: (groupId, tableMeta) => {
    set((s) => {
      const group = s.definition.schema?.groups.find((g) => g.id === groupId)
      if (!group) return

      if (tableMeta === undefined) {
        // Unbind ("解除") — drop tableMeta AND clear dbColumnName on every field.
        delete group.tableMeta
        group.fields.forEach((f) => { delete f.dbColumnName })
      } else {
        // Rebind to a DIFFERENT (namespace, tableName) → clear all field column hints
        const prev = group.tableMeta
        const isRebindToDifferentTable =
          prev !== undefined &&
          (prev.namespace !== tableMeta.namespace || prev.tableName !== tableMeta.tableName)
        if (isRebindToDifferentTable) {
          group.fields.forEach((f) => { delete f.dbColumnName })
        }
        group.tableMeta = { namespace: tableMeta.namespace, tableName: tableMeta.tableName }
      }
    })
    get().invalidateLivePreviewData()
  },

  bindGroupToTableWithColumns: (groupId, tableMeta, fieldColumns) => {
    set((s) => {
      const group = s.definition.schema?.groups.find((g) => g.id === groupId)
      if (!group) return
      group.tableMeta = { namespace: tableMeta.namespace, tableName: tableMeta.tableName }
      for (const { fieldId, dbColumnName } of fieldColumns) {
        const field = group.fields.find((f) => f.id === fieldId)
        if (!field) continue
        field.dbColumnName = dbColumnName
      }
    })
    get().invalidateLivePreviewData()
    // Does NOT call pushHistory — matches the existing bindGroupToTable convention.
  },

  setSchema: (schema) => {
    set((s) => { s.definition.schema = schema })
    get().invalidateLivePreviewData()
  },

  /**
   * Phase 2: bind an element to a schema field by fieldId.
   * Pass undefined to remove the binding.
   */
  setElementSchemaBinding: (pageId, elementId, fieldId) => set((s) => {
    for (const page of s.definition.pages) {
      if (page.id !== pageId) continue
      for (const section of page.sections ?? []) {
        for (const el of section.elements) {
          if (el.id !== elementId) continue
          el.schemaBinding = fieldId !== undefined ? { fieldId } : undefined
          return
        }
      }
    }
  }),

  ensureProductMasterGroup: () => set((s) => {
    if (!s.definition.schema) {
      s.definition.schema = { groups: [] }
    }
    const exists = s.definition.schema.groups.some(
      (g) => g.id === SYSTEM_GROUP_PRODUCT_MASTER,
    )
    if (!exists) {
      s.definition.schema.groups.push(buildProductMasterGroup())
    }
  }),
})
