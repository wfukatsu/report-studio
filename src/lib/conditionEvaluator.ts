/**
 * Condition evaluator for ConditionalDisplay — pure TypeScript, no JEXL.
 * Supports AND/OR logic with 8 operators.
 *
 * Security: all bracket accesses guard against prototype pollution via FORBIDDEN_KEYS.
 */

import type { ConditionalDisplay, DisplayCondition } from '@/types'

// ---------------------------------------------------------------------------
// Prototype pollution guard
// ---------------------------------------------------------------------------

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

// ---------------------------------------------------------------------------
// Field resolution
// ---------------------------------------------------------------------------

/**
 * Resolve a field path from the data object.
 *
 * Supports:
 * - Flat keys: "customer_name"
 * - Nested keys: "customer.address.city"
 * - Detail row access: "items[].product_name" (requires rowIndex)
 */
function resolveFieldValue(
  data: Record<string, unknown>,
  fieldPath: string,
  rowIndex?: number,
): unknown {
  // Detail row access: "groupDataKey[].fieldKey"
  const detailMatch = /^(.+)\[\]\.(.+)$/.exec(fieldPath)
  if (detailMatch) {
    const groupKey = detailMatch[1]!
    const fieldKey = detailMatch[2]!
    if (FORBIDDEN_KEYS.has(groupKey) || FORBIDDEN_KEYS.has(fieldKey)) return undefined
    const group = data[groupKey]
    if (!Array.isArray(group) || rowIndex === undefined) return undefined
    const row = group[rowIndex]
    if (typeof row !== 'object' || row === null) return undefined
    return FORBIDDEN_KEYS.has(fieldKey)
      ? undefined
      : (row as Record<string, unknown>)[fieldKey]
  }

  // Flat / nested path: split on "."
  const parts = fieldPath.split('.')
  let current: unknown = data
  for (const part of parts) {
    if (FORBIDDEN_KEYS.has(part)) return undefined
    if (typeof current !== 'object' || current === null) return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ---------------------------------------------------------------------------
// Single condition evaluation
// ---------------------------------------------------------------------------

function evaluateSingleCondition(
  condition: DisplayCondition,
  data: Record<string, unknown>,
  rowIndex?: number,
): boolean {
  const raw = resolveFieldValue(data, condition.fieldPath, rowIndex)
  const str = String(raw ?? '')

  switch (condition.operator) {
    // Nullary operators — no value needed
    case 'empty':        return raw == null || raw === ''
    case 'not_empty':    return raw != null && raw !== ''
    // Valued operators
    case 'equals':       return String(condition.value) === str
    case 'not_equals':   return String(condition.value) !== str
    case 'contains':     return str.includes(String(condition.value))
    case 'not_contains': return !str.includes(String(condition.value))
    case 'greater_than': return Number(raw) > Number(condition.value)
    case 'less_than':    return Number(raw) < Number(condition.value)
    default: {
      // Exhaustiveness check — catches unhandled operators at compile time
      const _exhaustive: never = condition
      void _exhaustive
      return false
    }
  }
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Evaluate a ConditionalDisplay against runtime data.
 *
 * - No conditions → always visible (returns true)
 * - AND: all conditions must be true
 * - OR:  at least one condition must be true
 *
 * @param cd         The ConditionalDisplay to evaluate
 * @param data       Runtime data record (merged from dataSources + computedValues)
 * @param rowIndex   Row index for detail-row access ("groupKey[].fieldKey" paths)
 */
export function evaluateConditionalDisplay(
  cd: ConditionalDisplay,
  data: Record<string, unknown>,
  rowIndex?: number,
): boolean {
  if (cd.conditions.length === 0) return true

  const results = cd.conditions.map((c) => evaluateSingleCondition(c, data, rowIndex))

  return cd.logic === 'and' ? results.every(Boolean) : results.some(Boolean)
}
