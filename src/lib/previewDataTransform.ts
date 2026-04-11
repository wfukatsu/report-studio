/**
 * Phase 2: Transform resolve-bindings response data for canvas rendering.
 *
 * Pure utility functions — no React, no Zustand dependencies.
 * All functions are exported for direct use in tests and components.
 */

import type { ComputedValue } from '@/store/types'
import type { SchemaDefinition } from '@/types'

/**
 * Transform the resolve-bindings response (`groupId → fieldKey → value`) into
 * a dataKey-based nested structure that the canvas `resolveField()` can traverse.
 *
 * @example
 * // Input:  resolved.grp_1 = { name: "山田" }, schema.groups[0].dataKey = "customer"
 * // Output: { customer: { name: "山田" } }
 *
 * Groups whose `groupId` is not found in the schema are skipped with a console.warn.
 * Groups whose `dataKey` is empty are skipped with a console.warn.
 */
export function buildFlatDataFromResolved(
  resolved: Record<string, Record<string, ComputedValue>>,
  schema: SchemaDefinition | undefined,
): Record<string, Record<string, ComputedValue>> {
  if (!schema) return {}
  const result: Record<string, Record<string, ComputedValue>> = {}
  for (const [groupId, values] of Object.entries(resolved)) {
    const group = schema.groups.find((g) => g.id === groupId)
    if (!group) {
      console.warn(`resolve-bindings: unknown groupId "${groupId}" — skipping`)
      continue
    }
    if (!group.dataKey) {
      console.warn(`resolve-bindings: empty dataKey for group "${groupId}" — skipping`)
      continue
    }
    result[group.dataKey] = values
  }
  return result
}
