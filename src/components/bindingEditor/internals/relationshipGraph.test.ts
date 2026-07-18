import { describe, it, expect } from 'vitest'
import {
  buildRelationshipEdges,
  inferRelationships,
  findPrimaryMaster,
  masterGroups,
  detailGroups,
  productMasterGroup,
  PRODUCT_FK_COLUMN,
  HEADER_KEY_COLUMN,
} from './relationshipGraph'
import { SYSTEM_GROUP_PRODUCT_MASTER } from '@/store/systemGroups'
import type { SchemaGroup, SchemaField } from '@/types'

function field(key: string, dbColumnName?: string): SchemaField {
  return { id: `f-${key}`, key, label: key, type: 'string', ...(dbColumnName ? { dbColumnName } : {}) }
}

function g(patch: Partial<SchemaGroup> & Pick<SchemaGroup, 'id' | 'role'>): SchemaGroup {
  return { label: patch.id, dataKey: patch.id, fields: [], ...patch }
}

const TABLE = { namespace: 'demo', tableName: 't' }

// A typical bound template: primary master + aux master + detail(+product FK).
function boundSchema(): SchemaGroup[] {
  return [
    g({ id: 'header', role: 'master', label: 'ヘッダ', tableMeta: TABLE, fields: [field('reportId', HEADER_KEY_COLUMN)] }),
    g({ id: 'customer', role: 'master', label: '顧客', tableMeta: TABLE, linkedMasterGroupId: 'header', fields: [field('rid', HEADER_KEY_COLUMN)] }),
    g({ id: 'items', role: 'detail', label: '明細', tableMeta: TABLE, linkedMasterGroupId: 'header', fields: [field('rid', HEADER_KEY_COLUMN), field('itemCode', PRODUCT_FK_COLUMN)] }),
    g({ id: SYSTEM_GROUP_PRODUCT_MASTER, role: 'master', label: '商品マスター', fields: [field('code')] }),
  ]
}

describe('relationshipGraph — selectors', () => {
  it('finds the primary master (no parent link, not system)', () => {
    expect(findPrimaryMaster(boundSchema())?.id).toBe('header')
  })

  it('lists master and detail groups excluding the product master system group', () => {
    const s = boundSchema()
    expect(masterGroups(s).map((x) => x.id)).toEqual(['header', 'customer'])
    expect(detailGroups(s).map((x) => x.id)).toEqual(['items'])
    expect(productMasterGroup(s)?.id).toBe(SYSTEM_GROUP_PRODUCT_MASTER)
  })
})

describe('relationshipGraph — buildRelationshipEdges', () => {
  it('emits a master-detail edge for a linked detail group', () => {
    const edges = buildRelationshipEdges(boundSchema())
    expect(edges).toContainEqual({ fromId: 'items', toId: 'header', kind: 'master-detail', cardinality: '1 — ∗' })
  })

  it('emits a lookup edge when a detail group has a product_code FK and product master exists', () => {
    const edges = buildRelationshipEdges(boundSchema())
    expect(edges).toContainEqual({ fromId: 'items', toId: SYSTEM_GROUP_PRODUCT_MASTER, kind: 'lookup', cardinality: '∗ — 1' })
  })

  it('does not emit a lookup edge when the product master is absent from the schema', () => {
    const s = boundSchema().filter((x) => x.id !== SYSTEM_GROUP_PRODUCT_MASTER)
    const edges = buildRelationshipEdges(s)
    expect(edges.some((e) => e.kind === 'lookup')).toBe(false)
  })

  it('omits aux master→primary links (they are shown clustered, not drawn)', () => {
    const edges = buildRelationshipEdges(boundSchema())
    expect(edges.some((e) => e.fromId === 'customer')).toBe(false)
  })

  it('emits no master-detail edge for an unlinked detail group', () => {
    const s = boundSchema().map((x) => (x.id === 'items' ? { ...x, linkedMasterGroupId: undefined } : x))
    const edges = buildRelationshipEdges(s)
    expect(edges.some((e) => e.kind === 'master-detail')).toBe(false)
  })
})

describe('relationshipGraph — inferRelationships', () => {
  it('suggests linking an unlinked, DB-bound group that shares the header key', () => {
    const s = boundSchema().map((x) => (x.id === 'items' ? { ...x, linkedMasterGroupId: undefined } : x))
    const suggestions = inferRelationships(s)
    expect(suggestions).toContainEqual({
      groupId: 'items',
      groupLabel: '明細',
      suggestedMasterId: 'header',
      suggestedMasterLabel: 'ヘッダ',
      via: HEADER_KEY_COLUMN,
    })
  })

  it('does not suggest already-linked groups', () => {
    const suggestions = inferRelationships(boundSchema())
    expect(suggestions).toEqual([])
  })

  it('does not suggest groups that are not DB-bound', () => {
    const s = boundSchema().map((x) =>
      x.id === 'items' ? { ...x, linkedMasterGroupId: undefined, tableMeta: undefined } : x,
    )
    expect(inferRelationships(s)).toEqual([])
  })

  it('returns nothing when the primary master has no header key column', () => {
    const s = boundSchema().map((x) =>
      x.id === 'header' ? { ...x, fields: [field('other', 'doc_no')] } : x,
    )
    expect(inferRelationships(s)).toEqual([])
  })
})
