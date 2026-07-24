/**
 * Pure utility functions for parsing data source values.
 */

import i18n from '@/i18n/config'
import type { DataSourceDefinition } from '@/types'

/**
 * Parse a single field value that may be JSON.
 * Returns ok:true with the parsed value, or ok:false with an error message.
 */
export function parseFieldValue(
  raw: string
): { ok: true; value: unknown } | { ok: false; error: string } {
  const trimmed = raw.trim()
  // Try JSON parse first
  try {
    const parsed = JSON.parse(trimmed)
    return { ok: true, value: parsed }
  } catch {
    // Fall back to treating as plain string
    return { ok: true, value: raw }
  }
}

/**
 * Parse a DataSource JSON string (the top-level fields object).
 * Returns ok:true with a Record of fields, or ok:false with an error.
 */
export function parseDataSourceJSON(
  json: string
): { ok: true; fields: Record<string, unknown> } | { ok: false; error: string } {
  try {
    const parsed = JSON.parse(json)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      return { ok: false, error: i18n.t('serverErrors:lib.dataSourceNotObject') }
    }
    return { ok: true, fields: parsed as Record<string, unknown> }
  } catch {
    return { ok: false, error: i18n.t('serverErrors:lib.dataSourceInvalidJson') }
  }
}

/**
 * Merge all DataSource fields into a single flat Record.
 * Later sources override earlier ones.
 */
export function mergePreviewData(
  dataSources: DataSourceDefinition[]
): Record<string, unknown> {
  return dataSources.reduce<Record<string, unknown>>(
    (acc, ds) => ({ ...acc, ...(ds.fields as Record<string, unknown>) }),
    {},
  )
}
