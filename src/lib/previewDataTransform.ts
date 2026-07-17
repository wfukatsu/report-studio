/**
 * Phase 2/2.5: Transform resolve-bindings response data for canvas rendering.
 *
 * Pure utility functions — no React, no Zustand dependencies.
 * All functions are exported for direct use in tests and components.
 */

import type { ComputedValue } from '@/store/types'
import type { SchemaDefinition } from '@/types'

type FlatRow = Record<string, ComputedValue>

/**
 * A group value from resolve-bindings:
 * - master groups → single flat row { fieldKey → value }
 * - detail groups (Phase 2.5) → array of rows [ { fieldKey → value }, ... ]
 */
type GroupValue = FlatRow | Array<FlatRow>

/**
 * Transform the resolve-bindings response into a dataKey-based structure
 * that the canvas `resolveField()` and `RepeatingBandRenderer` can consume.
 *
 * @example
 * // Master group input:  resolved.grp_1 = { name: "山田" }, dataKey = "customer"
 * // Output: { customer: { name: "山田" } }
 *
 * @example
 * // Detail group input:  resolved.grp_2 = [{ product: "A" }], dataKey = "items"
 * // Output: { items: [{ product: "A" }] }
 *
 * Groups whose `groupId` is not found in the schema are skipped with a console.warn.
 * Groups whose `dataKey` is empty are skipped with a console.warn.
 *
 * The output value type is `GroupValue` (flat object for master, row array for
 * detail) — structurally the store's `LivePreviewData`, so callers can pass the
 * result to `setLivePreviewData` without casting.
 */
export function buildFlatDataFromResolved(
  resolved: Record<string, GroupValue>,
  schema: SchemaDefinition | undefined,
): Record<string, GroupValue> {
  if (!schema) return {}
  const result: Record<string, GroupValue> = {}
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
    // master: flat object stored at dataKey (e.g. mergedData.customer = { name: ... })
    // detail: array stored at dataKey (e.g. mergedData.items = [{ product: ... }])
    // RepeatingBandRenderer already reads mergedData[element.dataSource] as array.
    result[group.dataKey] = values
  }
  return result
}
