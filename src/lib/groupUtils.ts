/**
 * Utility functions for LayerGroup — pure functions, no store dependency.
 * All lookups are O(1) via Map after a single O(n) build.
 */

import type { LayerGroup } from '@/types'

/**
 * Build a Map<elementId, LayerGroup> from an array of groups.
 * Call once per render cycle via useMemo.
 */
export function buildGroupMap(groups: LayerGroup[]): Map<string, LayerGroup> {
  const map = new Map<string, LayerGroup>()
  for (const group of groups) {
    for (const id of group.elementIds) {
      map.set(id, group)
    }
  }
  return map
}

/**
 * Effective visibility: if the element belongs to a hidden group, it is hidden
 * regardless of its own visible flag. The element's own flag is not mutated.
 */
export function resolveVisible(
  el: { id: string; visible: boolean },
  groupMap: Map<string, LayerGroup>,
): boolean {
  const group = groupMap.get(el.id)
  if (group && !group.visible) return false
  return el.visible
}

/**
 * Effective locked state: if the element belongs to a locked group, it is
 * locked regardless of its own locked flag. The element's own flag is not mutated.
 */
export function resolveLocked(
  el: { id: string; locked: boolean },
  groupMap: Map<string, LayerGroup>,
): boolean {
  const group = groupMap.get(el.id)
  if (group && group.locked) return true
  return el.locked
}
