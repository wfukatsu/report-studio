/**
 * RelationshipView — #141 model view, #142 product-master lookup exposure,
 * #143 shared-key inference + one-click approval.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RelationshipView } from './RelationshipView'
import { SYSTEM_GROUP_PRODUCT_MASTER } from '@/store/systemGroups'
import { PRODUCT_FK_COLUMN, HEADER_KEY_COLUMN } from './relationshipGraph'
import type { SchemaGroup, SchemaField } from '@/types'

function field(key: string, dbColumnName?: string): SchemaField {
  return { id: `f-${key}-${dbColumnName ?? ''}`, key, label: key, type: 'string', ...(dbColumnName ? { dbColumnName } : {}) }
}
function g(patch: Partial<SchemaGroup> & Pick<SchemaGroup, 'id' | 'role'>): SchemaGroup {
  return { label: patch.id, dataKey: patch.id, fields: [], ...patch }
}
const TABLE = { namespace: 'demo', tableName: 't' }

function schema(overrides: Partial<Record<'itemsLinked', boolean>> = {}): SchemaGroup[] {
  return [
    g({ id: 'header', role: 'master', label: 'ヘッダ', tableMeta: TABLE, fields: [field('reportId', HEADER_KEY_COLUMN)] }),
    g({
      id: 'items', role: 'detail', label: '明細', tableMeta: TABLE,
      linkedMasterGroupId: overrides.itemsLinked === false ? undefined : 'header',
      fields: [field('rid', HEADER_KEY_COLUMN), field('itemCode', PRODUCT_FK_COLUMN)],
    }),
    g({ id: SYSTEM_GROUP_PRODUCT_MASTER, role: 'master', label: '商品マスター', fields: [field('code')] }),
  ]
}

describe('RelationshipView (#141/#142/#143)', () => {
  it('renders the header cluster, detail node, and product master lookup source', () => {
    render(<RelationshipView groups={schema()} onSetLinkedMaster={vi.fn()} />)
    // "ヘッダ" appears twice: the cluster title and the master-group row.
    expect(screen.getAllByText('ヘッダ').length).toBeGreaterThan(0)
    expect(screen.getByText('明細')).toBeInTheDocument()
    // #142: product master (a hidden system group) is exposed here as a lookup source.
    expect(screen.getByText('商品マスター')).toBeInTheDocument()
    expect(screen.getByText(/lookup 元/)).toBeInTheDocument()
  })

  it('shows an error state for an unlinked detail group', () => {
    render(<RelationshipView groups={schema({ itemsLinked: false })} onSetLinkedMaster={vi.fn()} />)
    expect(screen.getByText(/親マスター未設定/)).toBeInTheDocument()
  })

  it('does not show the error when the detail group is linked', () => {
    render(<RelationshipView groups={schema()} onSetLinkedMaster={vi.fn()} />)
    expect(screen.queryByText(/親マスター未設定/)).not.toBeInTheDocument()
  })

  it('double-click opens an inline parent-master editor that sets the link', () => {
    const onSetLinkedMaster = vi.fn()
    render(<RelationshipView groups={schema({ itemsLinked: false })} onSetLinkedMaster={onSetLinkedMaster} />)
    fireEvent.doubleClick(screen.getByText('明細'))
    const select = screen.getByLabelText('明細 の親マスター') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'header' } })
    expect(onSetLinkedMaster).toHaveBeenCalledWith('items', 'header')
  })

  it('#143: surfaces a shared-key suggestion and approves it on click', () => {
    const onSetLinkedMaster = vi.fn()
    render(<RelationshipView groups={schema({ itemsLinked: false })} onSetLinkedMaster={onSetLinkedMaster} />)
    expect(screen.getByText(/件の関係を自動検出/)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/明細 → ヘッダ/))
    expect(onSetLinkedMaster).toHaveBeenCalledWith('items', 'header')
  })

  it('#143: "すべて承認" links every suggested group', () => {
    const onSetLinkedMaster = vi.fn()
    render(<RelationshipView groups={schema({ itemsLinked: false })} onSetLinkedMaster={onSetLinkedMaster} />)
    fireEvent.click(screen.getByText('すべて承認'))
    expect(onSetLinkedMaster).toHaveBeenCalledWith('items', 'header')
  })

  it('shows no suggestion bar when everything is already linked', () => {
    render(<RelationshipView groups={schema()} onSetLinkedMaster={vi.fn()} />)
    expect(screen.queryByText(/件の関係を自動検出/)).not.toBeInTheDocument()
  })

  it('renders nothing when there are no master or detail groups', () => {
    const { container } = render(<RelationshipView groups={[]} onSetLinkedMaster={vi.fn()} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('collapses and expands the diagram body', () => {
    render(<RelationshipView groups={schema()} onSetLinkedMaster={vi.fn()} />)
    // Body visible → product node present.
    expect(screen.getByText(/lookup 元/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('関係ビュー'))
    expect(screen.queryByText(/lookup 元/)).not.toBeInTheDocument()
  })
})
