/**
 * Client-side CSV export of a report's underlying data (#110).
 *
 * A 帳票 is a formatted document, but its data is tabular: repeating bands/lists
 * are backed by arrays, and master fields are scalars. This module turns the
 * resolved data into an Excel-openable CSV without any server round-trip.
 *
 * Table selection is deterministic:
 *   1. arrays referenced by a repeating element's `dataSource` (the report's
 *      real line-item tables), then
 *   2. any remaining top-level array-of-objects.
 * Scalar master fields are emitted as a leading 項目/値 block for context.
 */

import type { ReportDefinition, ReportElement } from '@/types'
// #436 documented exception: selectors is a pure derive module (no store instance)
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import { flattenPageElements } from '@/store/selectors'

type Row = Record<string, unknown>

interface Table {
  name: string
  rows: Row[]
}

function isRowArray(v: unknown): v is Row[] {
  return Array.isArray(v) && v.length > 0 && v.every((r) => r != null && typeof r === 'object' && !Array.isArray(r))
}

/** Resolve a possibly dotted key against the data record. */
function getByPath(data: Record<string, unknown>, path: string): unknown {
  if (path in data) return data[path]
  return path.split('.').reduce<unknown>((acc, part) => {
    if (acc != null && typeof acc === 'object') return (acc as Record<string, unknown>)[part]
    return undefined
  }, data)
}

function csvCell(v: unknown): string {
  if (v == null) return ''
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Ordered union of keys across all rows (first-appearance order). */
function unionKeys(rows: Row[]): string[] {
  const seen = new Set<string>()
  const keys: string[] = []
  for (const row of rows) {
    for (const k of Object.keys(row)) {
      if (!seen.has(k)) { seen.add(k); keys.push(k) }
    }
  }
  return keys
}

/** Collect the report's data tables, dataSource-referenced arrays first. */
export function collectReportTables(definition: ReportDefinition, data: Record<string, unknown>): Table[] {
  const preferredKeys: string[] = []
  const seenPref = new Set<string>()
  for (const page of definition.pages) {
    for (const el of flattenPageElements(page)) {
      const ds = (el as ReportElement & { dataSource?: string }).dataSource
      if ((el.type === 'repeatingBand' || el.type === 'repeatingList') && typeof ds === 'string' && ds && !seenPref.has(ds)) {
        seenPref.add(ds)
        preferredKeys.push(ds)
      }
    }
  }

  const tables: Table[] = []
  const used = new Set<string>()
  for (const key of preferredKeys) {
    const value = getByPath(data, key)
    if (isRowArray(value)) { tables.push({ name: key, rows: value }); used.add(key) }
  }
  for (const [key, value] of Object.entries(data)) {
    if (used.has(key)) continue
    if (isRowArray(value)) tables.push({ name: key, rows: value })
  }
  return tables
}

/** Top-level scalar (non-object) fields, as {key, value} pairs. */
function collectScalars(data: Record<string, unknown>): { key: string; value: unknown }[] {
  return Object.entries(data)
    .filter(([, v]) => v == null || typeof v !== 'object')
    .map(([key, value]) => ({ key, value }))
}

function tableToCsv(rows: Row[]): string {
  const headers = unionKeys(rows)
  const lines = [headers.map(csvCell).join(',')]
  for (const row of rows) lines.push(headers.map((h) => csvCell(row[h])).join(','))
  return lines.join('\n')
}

/**
 * Build a CSV string for the report's data. Returns an empty string (no BOM)
 * when there is nothing tabular or scalar to export, so callers can detect it.
 */
export function buildReportCsv(definition: ReportDefinition, data: Record<string, unknown>): string {
  const tables = collectReportTables(definition, data)
  const scalars = collectScalars(data)
  if (tables.length === 0 && scalars.length === 0) return ''

  const multiBlock = tables.length + (scalars.length > 0 ? 1 : 0) > 1
  const blocks: string[] = []

  if (scalars.length > 0) {
    const label = multiBlock ? '「項目」\n' : ''
    blocks.push(label + '項目,値\n' + scalars.map((s) => `${csvCell(s.key)},${csvCell(s.value)}`).join('\n'))
  }
  for (const table of tables) {
    const label = multiBlock ? `「${table.name}」\n` : ''
    blocks.push(label + tableToCsv(table.rows))
  }

  // UTF-8 BOM so Excel opens it with correct encoding (matches server CSV convention).
  return '\uFEFF' + blocks.join('\n\n')
}
