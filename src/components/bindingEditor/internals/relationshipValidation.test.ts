import { describe, it, expect } from 'vitest'
import { validateRelations } from './relationshipValidation'
import { SYSTEM_GROUP_PRODUCT_MASTER } from '@/store/systemGroups'
import type { SchemaGroup, SchemaField, SchemaRelation } from '@/types'

function field(key: string, dbColumnName?: string): SchemaField {
  return { id: `f-${key}`, key, label: key, type: 'string', ...(dbColumnName ? { dbColumnName } : {}) }
}
function g(patch: Partial<SchemaGroup> & Pick<SchemaGroup, 'id' | 'role'>): SchemaGroup {
  return { label: patch.id, dataKey: patch.id, fields: [], ...patch }
}

const GROUPS: SchemaGroup[] = [
  g({ id: 'items', role: 'detail', fields: [field('itemCode', 'product_code')] }),
  g({ id: SYSTEM_GROUP_PRODUCT_MASTER, role: 'master', fields: [field('code'), field('name')] }),
]

function rel(patch: Partial<SchemaRelation>): SchemaRelation {
  return {
    id: 'r1', name: 'product', from: 'items', to: SYSTEM_GROUP_PRODUCT_MASTER,
    on: { fromColumn: 'product_code', toColumn: 'code' }, kind: 'lookup', ...patch,
  }
}

describe('validateRelations (#144)', () => {
  it('returns no errors for a well-formed product lookup relation', () => {
    expect(validateRelations(GROUPS, [rel({})])).toEqual([])
  })

  it('returns no errors when there are no relations', () => {
    expect(validateRelations(GROUPS, undefined)).toEqual([])
    expect(validateRelations(GROUPS, [])).toEqual([])
  })

  it('flags a dangling from-group reference', () => {
    const errs = validateRelations(GROUPS, [rel({ from: 'ghost' })])
    expect(errs.map((e) => e.code)).toContain('dangling-from')
  })

  it('flags a dangling to-group reference', () => {
    const errs = validateRelations(GROUPS, [rel({ to: 'ghost' })])
    expect(errs.map((e) => e.code)).toContain('dangling-to')
  })

  it('flags a from-column join mismatch (column not a dbColumnName on the source)', () => {
    const errs = validateRelations(GROUPS, [rel({ on: { fromColumn: 'nope', toColumn: 'code' } })])
    expect(errs.map((e) => e.code)).toContain('from-column-missing')
  })

  it('flags a to-column join mismatch (column not present on the target)', () => {
    const errs = validateRelations(GROUPS, [rel({ on: { fromColumn: 'product_code', toColumn: 'nope' } })])
    expect(errs.map((e) => e.code)).toContain('to-column-missing')
  })

  it('accepts a to-column that matches a plain field key (product master has no dbColumnName)', () => {
    // 'code' is a field key on the product master, not a dbColumnName — still valid.
    expect(validateRelations(GROUPS, [rel({ on: { fromColumn: 'product_code', toColumn: 'code' } })])).toEqual([])
  })

  it('flags a self-reference', () => {
    const errs = validateRelations(GROUPS, [rel({ from: 'items', to: 'items', on: { fromColumn: 'product_code', toColumn: 'product_code' } })])
    expect(errs.map((e) => e.code)).toContain('self-reference')
  })

  it('detects a circular reference across relations', () => {
    const groups: SchemaGroup[] = [
      g({ id: 'a', role: 'detail', fields: [field('ka', 'ca')] }),
      g({ id: 'b', role: 'detail', fields: [field('kb', 'cb')] }),
    ]
    const relations: SchemaRelation[] = [
      { id: 'r1', name: 'ab', from: 'a', to: 'b', on: { fromColumn: 'ca', toColumn: 'cb' }, kind: 'lookup' },
      { id: 'r2', name: 'ba', from: 'b', to: 'a', on: { fromColumn: 'cb', toColumn: 'ca' }, kind: 'lookup' },
    ]
    const errs = validateRelations(groups, relations)
    expect(errs.map((e) => e.code)).toContain('cycle')
  })

  it('does not report a cycle for a simple acyclic chain', () => {
    const groups: SchemaGroup[] = [
      g({ id: 'a', role: 'detail', fields: [field('ka', 'ca')] }),
      g({ id: 'b', role: 'detail', fields: [field('kb', 'cb'), field('kb2', 'cb2')] }),
      g({ id: 'c', role: 'master', fields: [field('kc', 'cc')] }),
    ]
    const relations: SchemaRelation[] = [
      { id: 'r1', name: 'ab', from: 'a', to: 'b', on: { fromColumn: 'ca', toColumn: 'cb' }, kind: 'lookup' },
      { id: 'r2', name: 'bc', from: 'b', to: 'c', on: { fromColumn: 'cb2', toColumn: 'cc' }, kind: 'lookup' },
    ]
    expect(validateRelations(groups, relations).some((e) => e.code === 'cycle')).toBe(false)
  })
})
