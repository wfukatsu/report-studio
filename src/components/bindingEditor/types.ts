/**
 * BindingEditor types — v2 equivalents derived from v1 BindingEditorPage.
 *
 * Key difference from v1: v2 stores schema/elements in Zustand (not local state).
 * These types represent derived/display-only structures for the binding editor UI.
 */

import type { SchemaField, SchemaGroup, ReportElement } from '@/types'

// ---------------------------------------------------------------------------
// Element display model (derived from store pages/sections/elements)
// ---------------------------------------------------------------------------

/** Flat representation of a bindable element for the left panel. */
export interface BindableElement {
  readonly pageId: string
  readonly elementId: string
  readonly elementLabel: string
  readonly elementType: string
  /** Currently bound schema field ID */
  readonly boundFieldId?: string
  /** If this element is inside a repeating container */
  readonly repeatContainerId?: string
  /** The dataSource key of the repeating container (e.g. "items") */
  readonly repeatDataSource?: string
}

/** Sub-group within a page: single elements or repeat-container elements. */
export interface ElementSubGroup {
  readonly id: string
  readonly label: string
  /** 'single' = normal elements, 'repeat' = inside a repeatingBand/List */
  readonly role: 'single' | 'repeat'
  /** DataSource key for repeat groups */
  readonly dataSource?: string
  readonly elements: readonly BindableElement[]
}

/** Elements grouped by page, with sub-groups for repeat containers. */
export interface ElementGroup {
  readonly pageId: string
  readonly pageLabel: string
  readonly subGroups: readonly ElementSubGroup[]
  /** Flat list of all elements (for backward compat) */
  readonly elements: readonly BindableElement[]
}

// ---------------------------------------------------------------------------
// Field display model (derived from store schema)
// ---------------------------------------------------------------------------

/** Flat representation of a schema field for the center panel. */
export interface FieldItem {
  readonly fieldId: string
  readonly fieldKey: string
  readonly fieldLabel: string
  readonly groupId: string
  readonly groupLabel: string
  readonly dbColumnName?: string
  readonly computed?: true
  readonly expression?: string
}

// ---------------------------------------------------------------------------
// Connection model
// ---------------------------------------------------------------------------

/** A binding connection between a schema field and a template element. */
export interface BindingConnection {
  readonly fieldId: string
  readonly elementId: string
  /** Schema group ID for color-coding connection lines */
  readonly groupId: string
}

// ---------------------------------------------------------------------------
// UI state types
// ---------------------------------------------------------------------------

/** Drag state for drag-to-connect mode. Supports both directions. */
export type DragState =
  | { readonly source: 'field'; readonly fieldId: string; readonly startX: number; readonly startY: number; readonly currentX: number; readonly currentY: number }
  | { readonly source: 'element'; readonly pageId: string; readonly elementId: string; readonly elementLabel: string; readonly startX: number; readonly startY: number; readonly currentX: number; readonly currentY: number }

/** Bulk generation request. */
export interface BulkRequest {
  readonly side: 'template' | 'schema'
  readonly groupId: string
}

/** Bulk generation candidate item. */
export interface BulkItem {
  readonly name: string
  readonly type: string
}

// ---------------------------------------------------------------------------
// SVG connection line
// ---------------------------------------------------------------------------

export interface LinePos {
  readonly x1: number
  readonly y1: number
  readonly x2: number
  readonly y2: number
  readonly fieldId: string
  readonly elementId: string
  /** Schema group ID for color-coding */
  readonly groupId: string
  /** True when either endpoint's group is collapsed */
  readonly isCollapsed: boolean
}

/** Group color palette for connection lines (up to 8 groups). */
export const GROUP_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // red
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#ec4899', // pink
] as const

export function getGroupColor(groupIndex: number): string {
  return GROUP_COLORS[groupIndex % GROUP_COLORS.length]
}

// ---------------------------------------------------------------------------
// Reorder types
// ---------------------------------------------------------------------------

export type ReorderValidation =
  | { readonly allowed: true }
  | { readonly allowed: true; readonly warning: ReorderWarning }
  | { readonly allowed: false; readonly reason: string }

export interface ReorderWarning {
  readonly title: string
  readonly message: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Element types that support schemaBinding. */
export const BINDABLE_TYPES = new Set([
  'dataField', 'text', 'checkbox', 'eraSelect',
] as const)

/** Check if an element type supports schema binding. */
export function isBindableType(type: string): boolean {
  return BINDABLE_TYPES.has(type as never)
}

// ---------------------------------------------------------------------------
// Re-exports for convenience
// ---------------------------------------------------------------------------

export type { SchemaField, SchemaGroup, ReportElement }
