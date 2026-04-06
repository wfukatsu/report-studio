/**
 * Aggregation utilities for RepeatingBand totals.
 */

import type { RepeatingBandTotalFormula } from '@/types'
import { resolveField } from './dataBinding'

/**
 * Aggregate a numeric field across all records using the given formula.
 * Returns 0 for empty records (avoids NaN).
 */
export function aggregateField(
  records: Record<string, unknown>[],
  fieldKey: string,
  formula: RepeatingBandTotalFormula,
): number {
  if (records.length === 0) return 0

  const values = records.map((r) => {
    const v = Number(resolveField(r, fieldKey))
    return Number.isNaN(v) ? 0 : v
  })

  switch (formula) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0)
    case 'count':
      return records.length
    case 'avg': {
      const sum = values.reduce((a, b) => a + b, 0)
      return sum / values.length
    }
    case 'min':
      return values.length === 0 ? 0 : values.reduce((m, v) => v < m ? v : m, Infinity)
    case 'max':
      return values.length === 0 ? 0 : values.reduce((m, v) => v > m ? v : m, -Infinity)
    default:
      return 0
  }
}
