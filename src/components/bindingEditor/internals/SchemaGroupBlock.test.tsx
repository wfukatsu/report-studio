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
  onUpdateGroup = vi.fn(),
  onRemoveGroup?: (groupId: string) => void,
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
      onUpdateGroup={onUpdateGroup}
      addingField={false}
      onToggle={noop}
      onAddField={noop}
      onRemoveField={noop}
      onRemoveGroup={onRemoveGroup}
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
  return { onSetLinkedMaster, onUpdateGroup }
}

function makeMasterGroup(patch: Partial<SchemaGroup> = {}): SchemaGroup {
  return {
    id: 'header',
    label: 'ヘッダ',
    role: 'master',
    dataKey: 'header',
    fields: [{ id: 'f1', key: 'docNo', label: '番号', type: 'string' }],
    ...patch,
  }
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

describe('SchemaGroupBlock — inline group edit (#139)', () => {
  it('enters edit mode from the pencil and prefills current values', () => {
    renderBlock(makeMasterGroup(), MASTERS)
    fireEvent.click(screen.getByLabelText('グループを編集'))
    expect((screen.getByLabelText('グループ名称') as HTMLInputElement).value).toBe('ヘッダ')
    expect((screen.getByLabelText('データキー') as HTMLInputElement).value).toBe('header')
    expect((screen.getByLabelText('グループの種別') as HTMLSelectElement).value).toBe('master')
  })

  it('saves edited label / dataKey / role via onUpdateGroup', () => {
    const { onUpdateGroup } = renderBlock(makeMasterGroup(), MASTERS)
    fireEvent.click(screen.getByLabelText('グループを編集'))
    fireEvent.change(screen.getByLabelText('グループ名称'), { target: { value: '請求ヘッダ' } })
    fireEvent.change(screen.getByLabelText('データキー'), { target: { value: 'invoice_header' } })
    fireEvent.click(screen.getByLabelText('グループを保存'))
    expect(onUpdateGroup).toHaveBeenCalledWith('header', {
      label: '請求ヘッダ',
      dataKey: 'invoice_header',
      role: 'master',
    })
  })

  it('sanitizes spaces and non-word chars in dataKey to the 2-level key grammar', () => {
    const { onUpdateGroup } = renderBlock(makeMasterGroup(), MASTERS)
    fireEvent.click(screen.getByLabelText('グループを編集'))
    fireEvent.change(screen.getByLabelText('データキー'), { target: { value: 'line items 2!' } })
    fireEvent.click(screen.getByLabelText('グループを保存'))
    // spaces → "_", "!" dropped, starts with a letter → valid
    expect(onUpdateGroup).toHaveBeenCalledWith('header', expect.objectContaining({ dataKey: 'line_items_2' }))
  })

  it('falls back to the original dataKey when the input cannot start a valid key', () => {
    const { onUpdateGroup } = renderBlock(makeMasterGroup(), MASTERS)
    fireEvent.click(screen.getByLabelText('グループを編集'))
    fireEvent.change(screen.getByLabelText('データキー'), { target: { value: '123' } })
    fireEvent.click(screen.getByLabelText('グループを保存'))
    // A key can't start with a digit → keep the existing dataKey rather than break it
    expect(onUpdateGroup).toHaveBeenCalledWith('header', expect.objectContaining({ dataKey: 'header' }))
  })

  it('clears linkedMasterGroupId when a detail group is switched to master', () => {
    const { onUpdateGroup } = renderBlock(
      makeDetailGroup({ linkedMasterGroupId: 'header' }),
      MASTERS,
    )
    fireEvent.click(screen.getByLabelText('グループを編集'))
    fireEvent.change(screen.getByLabelText('グループの種別'), { target: { value: 'master' } })
    fireEvent.click(screen.getByLabelText('グループを保存'))
    expect(onUpdateGroup).toHaveBeenCalledWith('items', {
      label: '明細',
      dataKey: 'items',
      role: 'master',
      linkedMasterGroupId: undefined,
    })
  })

  it('does not render a group-delete button when onRemoveGroup is omitted', () => {
    renderBlock(makeMasterGroup(), MASTERS)
    expect(screen.queryByLabelText('グループを削除')).not.toBeInTheDocument()
  })

  it('cancel discards edits without calling onUpdateGroup', () => {
    const { onUpdateGroup } = renderBlock(makeMasterGroup(), MASTERS)
    fireEvent.click(screen.getByLabelText('グループを編集'))
    fireEvent.change(screen.getByLabelText('グループ名称'), { target: { value: 'X' } })
    fireEvent.click(screen.getByLabelText('編集をキャンセル'))
    expect(onUpdateGroup).not.toHaveBeenCalled()
    // Back to display mode.
    expect(screen.queryByLabelText('グループ名称')).not.toBeInTheDocument()
  })
})

describe('SchemaGroupBlock — group deletion (#407)', () => {
  it('calls onRemoveGroup with the group id when the delete button is clicked', () => {
    const onRemoveGroup = vi.fn()
    renderBlock(makeMasterGroup(), MASTERS, vi.fn(), vi.fn(), onRemoveGroup)
    fireEvent.click(screen.getByLabelText('グループを削除'))
    expect(onRemoveGroup).toHaveBeenCalledWith('header')
  })

  it('hides the delete button for system groups (商品マスター)', () => {
    renderBlock(
      makeMasterGroup({ id: '__productMaster__', label: '商品マスター' }),
      MASTERS,
      vi.fn(),
      vi.fn(),
      vi.fn(),
    )
    expect(screen.queryByLabelText('グループを削除')).not.toBeInTheDocument()
    // The edit affordance stays available.
    expect(screen.getByLabelText('グループを編集')).toBeInTheDocument()
  })
})
