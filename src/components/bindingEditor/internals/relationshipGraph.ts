/**
 * relationshipGraph — pure derivation of master/detail/product relationships
 * from the schema, plus shared-key inference for one-click approval.
 *
 * Data model (see CLAUDE.md):
 * - master → detail (1—∗): detail.linkedMasterGroupId points at the primary master.
 * - detail → product (∗—1 lookup): the detail group has a field mapped to the
 *   `product_code` FK column. This relationship is DERIVED (no stored object
 *   until #144), so it needs no approval — only visualization.
 * - aux master groups share the header row with the primary master; they are
 *   shown clustered with it, so their intra-cluster link is not drawn.
 */

import type { SchemaGroup } from '@/types'
import { SYSTEM_GROUP_PRODUCT_MASTER, isSystemGroup } from '@/store/systemGroups'

/** FK column a detail row uses to reference the shared product master. */
export const PRODUCT_FK_COLUMN = 'product_code'
/** Surrogate key column shared by a header row and its detail/aux rows. */
export const HEADER_KEY_COLUMN = 'report_id'

export type RelationshipKind = 'master-detail' | 'lookup'

export interface RelationshipEdge {
  /** Detail group id (the "from" side is always a detail group). */
  readonly fromId: string
  /** Parent master group id (master-detail) or the product master id (lookup). */
  readonly toId: string
  readonly kind: RelationshipKind
  /** Human-facing cardinality label, e.g. "1 — ∗". */
  readonly cardinality: string
}

export interface RelationshipSuggestion {
  readonly groupId: string
  readonly groupLabel: string
  readonly suggestedMasterId: string
  readonly suggestedMasterLabel: string
  /** The shared key column the suggestion was inferred from. */
  readonly via: string
}

/** True when a group has a field bound to the given DB column. */
function hasColumn(group: SchemaGroup, column: string): boolean {
  return group.fields.some((f) => f.dbColumnName === column)
}

/** The primary master: a non-system master group with no parent link. */
export function findPrimaryMaster(groups: readonly SchemaGroup[]): SchemaGroup | undefined {
  return groups.find(
    (g) => g.role === 'master' && !isSystemGroup(g.id) && !g.linkedMasterGroupId,
  )
}

/** Non-system master groups — the visual "header" cluster. */
export function masterGroups(groups: readonly SchemaGroup[]): SchemaGroup[] {
  return groups.filter((g) => g.role === 'master' && !isSystemGroup(g.id))
}

/** Non-system detail groups. */
export function detailGroups(groups: readonly SchemaGroup[]): SchemaGroup[] {
  return groups.filter((g) => g.role === 'detail' && !isSystemGroup(g.id))
}

/** The product master system group, if present in the schema. */
export function productMasterGroup(groups: readonly SchemaGroup[]): SchemaGroup | undefined {
  return groups.find((g) => g.id === SYSTEM_GROUP_PRODUCT_MASTER)
}

/**
 * Edges to render: detail→master structural links and detail→product lookups.
 * Aux master↔primary links are intentionally omitted (shown clustered).
 */
export function buildRelationshipEdges(groups: readonly SchemaGroup[]): RelationshipEdge[] {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const productExists = groups.some((g) => g.id === SYSTEM_GROUP_PRODUCT_MASTER)
  const edges: RelationshipEdge[] = []

  for (const g of groups) {
    if (g.role !== 'detail' || isSystemGroup(g.id)) continue

    if (g.linkedMasterGroupId && byId.has(g.linkedMasterGroupId)) {
      edges.push({ fromId: g.id, toId: g.linkedMasterGroupId, kind: 'master-detail', cardinality: '1 — ∗' })
    }
    if (productExists && hasColumn(g, PRODUCT_FK_COLUMN)) {
      edges.push({ fromId: g.id, toId: SYSTEM_GROUP_PRODUCT_MASTER, kind: 'lookup', cardinality: '∗ — 1' })
    }
  }
  return edges
}

/**
 * Suggest parent-master links for groups that are DB-bound and share the header
 * key column with the primary master but have no linkedMasterGroupId yet.
 * Applies to detail groups and aux master groups alike.
 */
export function inferRelationships(groups: readonly SchemaGroup[]): RelationshipSuggestion[] {
  const primary = findPrimaryMaster(groups)
  if (!primary || !hasColumn(primary, HEADER_KEY_COLUMN)) return []

  const suggestions: RelationshipSuggestion[] = []
  for (const g of groups) {
    if (isSystemGroup(g.id) || g.id === primary.id) continue
    if (g.linkedMasterGroupId) continue // already linked
    if (!g.tableMeta) continue // not DB-bound → nothing to infer from
    if (!hasColumn(g, HEADER_KEY_COLUMN)) continue // must share the header key
    suggestions.push({
      groupId: g.id,
      groupLabel: g.label || g.id,
      suggestedMasterId: primary.id,
      suggestedMasterLabel: primary.label || primary.id,
      via: HEADER_KEY_COLUMN,
    })
  }
  return suggestions
}
