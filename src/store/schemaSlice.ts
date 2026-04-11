/**
 * Schema slice — SchemaDefinition CRUD (groups + fields).
 * Schema lives on definition but is not in undo/redo history (same as calculationRules).
 */

import type { StateCreator } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import type { SchemaGroup, SchemaField } from '@/types'
import type { StoreState } from './types'

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
>

export const createSchemaSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  SchemaSlice
> = (set) => ({
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

  removeSchemaGroup: (groupId) => set((s) => {
    if (!s.definition.schema) return
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
    // Invalidate live preview data — schema changed
    s.livePreviewData = null
  }),

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

  removeSchemaField: (groupId, fieldId) => set((s) => {
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
    // Invalidate live preview data — schema changed
    s.livePreviewData = null
  }),

  updateSchemaField: (groupId, fieldId, patch) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    const field = group?.fields.find((f) => f.id === fieldId)
    if (!field) return
    Object.assign(field, patch)
  }),

  bindGroupToTable: (groupId, tableMeta) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return

    if (tableMeta === undefined) {
      // Unbind ("解除") — drop tableMeta AND clear dbColumnName on every field.
      delete group.tableMeta
      group.fields.forEach((f) => { delete f.dbColumnName })
      s.livePreviewData = null
      return
    }

    // Rebind to a DIFFERENT (namespace, tableName) → clear all field column hints
    const prev = group.tableMeta
    const isRebindToDifferentTable =
      prev !== undefined &&
      (prev.namespace !== tableMeta.namespace || prev.tableName !== tableMeta.tableName)
    if (isRebindToDifferentTable) {
      group.fields.forEach((f) => { delete f.dbColumnName })
    }
    group.tableMeta = { namespace: tableMeta.namespace, tableName: tableMeta.tableName }
    s.livePreviewData = null
  }),

  bindGroupToTableWithColumns: (groupId, tableMeta, fieldColumns) => set((s) => {
    const group = s.definition.schema?.groups.find((g) => g.id === groupId)
    if (!group) return

    group.tableMeta = { namespace: tableMeta.namespace, tableName: tableMeta.tableName }

    for (const { fieldId, dbColumnName } of fieldColumns) {
      const field = group.fields.find((f) => f.id === fieldId)
      if (!field) continue
      field.dbColumnName = dbColumnName
    }
    s.livePreviewData = null
    // Does NOT call pushHistory — matches the existing bindGroupToTable convention.
  }),

  setSchema: (schema) => set((s) => {
    s.definition.schema = schema
    s.livePreviewData = null
  }),

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
})
