/**
 * relationshipValidation — #144: design-time checks for named relation objects.
 *
 * Catches the three failure modes the issue calls out:
 * - dangling references (from/to group id not in the schema),
 * - join-key mismatch (the join columns don't exist on either side),
 * - circular references (relations form a directed cycle).
 *
 * Pure and dependency-free so it is unit-testable and can run on every edit.
 */

import type { SchemaGroup, SchemaRelation } from '@/types'

export type RelationErrorCode =
  | 'dangling-from'
  | 'dangling-to'
  | 'from-column-missing'
  | 'to-column-missing'
  | 'self-reference'
  | 'cycle'

export interface RelationValidationError {
  /** Relation this error is anchored to (undefined for a cycle spanning several). */
  readonly relationId?: string
  readonly code: RelationErrorCode
  readonly message: string
}

/** A `from`-side column is a DB column, so it must be a field's dbColumnName. */
function hasFromColumn(group: SchemaGroup, column: string): boolean {
  return group.fields.some((f) => f.dbColumnName === column)
}

/**
 * A `to`-side column may be a DB column (dbColumnName) or, for the product
 * master system group whose fields carry no dbColumnName, a plain field key.
 */
function hasToColumn(group: SchemaGroup, column: string): boolean {
  return group.fields.some((f) => f.dbColumnName === column || f.key === column)
}

/** Validate every relation; returns a flat list of errors (empty = all valid). */
export function validateRelations(
  groups: readonly SchemaGroup[],
  relations: readonly SchemaRelation[] | undefined,
): RelationValidationError[] {
  const errors: RelationValidationError[] = []
  if (!relations || relations.length === 0) return errors

  const byId = new Map(groups.map((g) => [g.id, g]))

  for (const rel of relations) {
    const fromGroup = byId.get(rel.from)
    const toGroup = byId.get(rel.to)

    if (rel.from === rel.to) {
      errors.push({ relationId: rel.id, code: 'self-reference', message: `関係「${rel.name}」が同一グループを指しています。` })
    }
    if (!fromGroup) {
      errors.push({ relationId: rel.id, code: 'dangling-from', message: `関係「${rel.name}」の参照元グループが存在しません。` })
    }
    if (!toGroup) {
      errors.push({ relationId: rel.id, code: 'dangling-to', message: `関係「${rel.name}」の参照先グループが存在しません。` })
    }
    if (fromGroup && !hasFromColumn(fromGroup, rel.on.fromColumn)) {
      errors.push({
        relationId: rel.id,
        code: 'from-column-missing',
        message: `結合キー不整合: 「${fromGroup.label || fromGroup.id}」に列 ${rel.on.fromColumn} がありません。`,
      })
    }
    if (toGroup && !hasToColumn(toGroup, rel.on.toColumn)) {
      errors.push({
        relationId: rel.id,
        code: 'to-column-missing',
        message: `結合キー不整合: 「${toGroup.label || toGroup.id}」に列 ${rel.on.toColumn} がありません。`,
      })
    }
  }

  // Cycle detection over the directed from→to graph (self-refs handled above).
  const cycle = findCycle(relations)
  if (cycle.length > 0) {
    errors.push({
      code: 'cycle',
      message: `循環参照を検出しました: ${cycle.join(' → ')}`,
    })
  }

  return errors
}

/**
 * Returns the group ids forming a cycle (as a readable path), or [] if none.
 * Ignores self-references (reported separately) to avoid duplicate noise.
 */
function findCycle(relations: readonly SchemaRelation[]): string[] {
  const adj = new Map<string, string[]>()
  for (const r of relations) {
    if (r.from === r.to) continue
    const list = adj.get(r.from) ?? []
    list.push(r.to)
    adj.set(r.from, list)
  }

  const WHITE = 0, GRAY = 1, BLACK = 2
  const color = new Map<string, number>()
  const stack: string[] = []

  function dfs(node: string): string[] | null {
    color.set(node, GRAY)
    stack.push(node)
    for (const next of adj.get(node) ?? []) {
      const c = color.get(next) ?? WHITE
      if (c === GRAY) {
        // Found a back-edge — slice the stack from the first occurrence of `next`.
        const start = stack.indexOf(next)
        return [...stack.slice(start), next]
      }
      if (c === WHITE) {
        const found = dfs(next)
        if (found) return found
      }
    }
    stack.pop()
    color.set(node, BLACK)
    return null
  }

  for (const node of adj.keys()) {
    if ((color.get(node) ?? WHITE) === WHITE) {
      const found = dfs(node)
      if (found) return found
    }
  }
  return []
}
