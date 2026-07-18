/**
 * SchemaGroupBlock — #138: parent-master relationship picker + unset-relationship
 * error state for detail groups (avoids the silent cartesian-product trap).
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SchemaGroupBlock, type MasterGroupOption } from './SchemaGroupBlock'
import type { SchemaGroup } from '@/types'

function makeDetailGroup(patch: Partial<SchemaGroup> = {}): SchemaGroup {
  return {
    id: 'items',
    label: '明細',
    role: 'detail',
    dataKey: 'items',
    fields: [{ id: 'f1', key: 'qty', label: '数量', type: 'number' }],
    ...patch,
  }
}

/** Render SchemaGroupBlock with all required no-op props; caller supplies overrides. */
function renderBlock(
  group: SchemaGroup,
  masterGroups: readonly MasterGroupOption[],
  onSetLinkedMaster = vi.fn(),
) {
  const noop = () => {}
  render(
    <SchemaGroupBlock
      group={group}
      groupIndex={1}
      expanded
      boundFieldIds={new Set()}
      masterGroups={masterGroups}
      onSetLinkedMaster={onSetLinkedMaster}
      addingField={false}
      onToggle={noop}
      onAddField={noop}
      onRemoveField={noop}
      onSetAddingField={noop}
      onConnect={noop}
      fieldRef={noop}
      onFieldDragStart={noop}
      onDragMove={noop}
      onDropOnField={noop}
      selectedFieldId={null}
      isDraggingElement={false}
      fieldBoundCount={new Map()}
      hoveredFieldId={null}
      onHoverField={noop}
    />,
  )
  return { onSetLinkedMaster }
}

const MASTERS: MasterGroupOption[] = [
  { id: 'header', label: 'ヘッダ' },
  { id: 'customer', label: '顧客' },
]

describe('SchemaGroupBlock — 親マスター relationship (#138)', () => {
  it('shows an explicit error when a detail group has no linked master', () => {
    renderBlock(makeDetailGroup({ linkedMasterGroupId: undefined }), MASTERS)
    expect(screen.getByText(/関係が未設定です/)).toBeInTheDocument()
    // The picker sits at the empty "未設定…" option.
    const select = screen.getByLabelText('明細 の親マスター') as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('sets linkedMasterGroupId when a master is picked', () => {
    const { onSetLinkedMaster } = renderBlock(makeDetailGroup(), MASTERS)
    fireEvent.change(screen.getByLabelText('明細 の親マスター'), {
      target: { value: 'header' },
    })
    expect(onSetLinkedMaster).toHaveBeenCalledWith('items', 'header')
  })

  it('clears the relationship when "未設定…" is re-selected', () => {
    const { onSetLinkedMaster } = renderBlock(
      makeDetailGroup({ linkedMasterGroupId: 'header' }),
      MASTERS,
    )
    fireEvent.change(screen.getByLabelText('明細 の親マスター'), {
      target: { value: '' },
    })
    expect(onSetLinkedMaster).toHaveBeenCalledWith('items', undefined)
  })

  it('does not show the error when a valid master is linked', () => {
    renderBlock(makeDetailGroup({ linkedMasterGroupId: 'header' }), MASTERS)
    expect(screen.queryByText(/関係が未設定です/)).not.toBeInTheDocument()
    const select = screen.getByLabelText('明細 の親マスター') as HTMLSelectElement
    expect(select.value).toBe('header')
  })

  it('treats a dangling linkedMasterGroupId (removed master) as an error', () => {
    renderBlock(makeDetailGroup({ linkedMasterGroupId: 'ghost' }), MASTERS)
    expect(screen.getByText(/関係が未設定です/)).toBeInTheDocument()
    const select = screen.getByLabelText('明細 の親マスター') as HTMLSelectElement
    expect(select.value).toBe('')
  })

  it('shows a neutral hint (no error) when no master groups exist', () => {
    renderBlock(makeDetailGroup(), [])
    expect(screen.getByText(/リンクできるマスターがありません/)).toBeInTheDocument()
    expect(screen.queryByText(/関係が未設定です/)).not.toBeInTheDocument()
  })

  it('does not render the relationship band for master groups', () => {
    renderBlock(
      makeDetailGroup({ id: 'header', label: 'ヘッダ', role: 'master' }),
      MASTERS,
    )
    expect(screen.queryByText('親マスター')).not.toBeInTheDocument()
    expect(screen.queryByText(/リンクできるマスターがありません/)).not.toBeInTheDocument()
  })
})
