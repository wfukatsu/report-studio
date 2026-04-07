import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LayerGroupRow } from './LayerGroupRow'
import type { LayerGroup } from '@/types'

const baseGroup: LayerGroup = {
  id: 'grp-1',
  name: 'テストグループ',
  elementIds: ['el-1', 'el-2'],
  collapsed: false,
  visible: true,
  locked: false,
}

function renderRow(
  overrides: Partial<LayerGroup> = {},
  handlers: {
    onToggleCollapse?: () => void
    onToggleVisible?: () => void
    onToggleLock?: () => void
    onRename?: (name: string) => void
    onContextMenu?: (e: React.MouseEvent) => void
    isAnyMemberSelected?: boolean
  } = {},
) {
  const group = { ...baseGroup, ...overrides }
  const props = {
    group,
    isAnyMemberSelected: handlers.isAnyMemberSelected ?? false,
    onToggleCollapse: handlers.onToggleCollapse ?? vi.fn(),
    onToggleVisible: handlers.onToggleVisible ?? vi.fn(),
    onToggleLock: handlers.onToggleLock ?? vi.fn(),
    onRename: handlers.onRename ?? vi.fn(),
    onContextMenu: handlers.onContextMenu ?? vi.fn(),
  }
  return render(<LayerGroupRow {...props} />)
}

describe('LayerGroupRow — 基本レンダリング', () => {
  it('renders group name', () => {
    renderRow()
    expect(screen.getByText('テストグループ')).toBeInTheDocument()
  })

  it('shows expand button when collapsed', () => {
    renderRow({ collapsed: true })
    expect(screen.getByRole('button', { name: 'グループを展開' })).toBeInTheDocument()
  })

  it('shows collapse button when not collapsed', () => {
    renderRow({ collapsed: false })
    expect(screen.getByRole('button', { name: 'グループを折りたたむ' })).toBeInTheDocument()
  })
})

describe('LayerGroupRow — コールバック', () => {
  it('calls onToggleCollapse when collapse button clicked', () => {
    const onToggleCollapse = vi.fn()
    renderRow({}, { onToggleCollapse })
    fireEvent.click(screen.getByRole('button', { name: 'グループを折りたたむ' }))
    expect(onToggleCollapse).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleVisible when visibility button clicked', () => {
    const onToggleVisible = vi.fn()
    renderRow({}, { onToggleVisible })
    fireEvent.click(screen.getByTitle('グループを非表示'))
    expect(onToggleVisible).toHaveBeenCalledTimes(1)
  })

  it('shows 表示 title when group is hidden', () => {
    renderRow({ visible: false })
    expect(screen.getByTitle('グループを表示')).toBeInTheDocument()
  })

  it('calls onToggleLock when lock button clicked', () => {
    const onToggleLock = vi.fn()
    renderRow({}, { onToggleLock })
    fireEvent.click(screen.getByTitle('グループをロック'))
    expect(onToggleLock).toHaveBeenCalledTimes(1)
  })

  it('shows ロック解除 title when group is locked', () => {
    renderRow({ locked: true })
    expect(screen.getByTitle('グループのロックを解除')).toBeInTheDocument()
  })

  it('calls onContextMenu when right-clicked', () => {
    const onContextMenu = vi.fn()
    renderRow({}, { onContextMenu })
    fireEvent.contextMenu(screen.getByText('テストグループ').closest('div')!)
    expect(onContextMenu).toHaveBeenCalledTimes(1)
  })
})

describe('LayerGroupRow — リネーム', () => {
  it('starts rename mode on double-click', () => {
    renderRow()
    fireEvent.doubleClick(screen.getByText('テストグループ'))
    expect(screen.getByDisplayValue('テストグループ')).toBeInTheDocument()
  })

  it('commits rename on Enter', () => {
    const onRename = vi.fn()
    renderRow({}, { onRename })
    fireEvent.doubleClick(screen.getByText('テストグループ'))
    const input = screen.getByDisplayValue('テストグループ')
    fireEvent.change(input, { target: { value: '新しい名前' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('新しい名前')
  })

  it('commits rename on blur', () => {
    const onRename = vi.fn()
    renderRow({}, { onRename })
    fireEvent.doubleClick(screen.getByText('テストグループ'))
    const input = screen.getByDisplayValue('テストグループ')
    fireEvent.change(input, { target: { value: '変更した名前' } })
    fireEvent.blur(input)
    expect(onRename).toHaveBeenCalledWith('変更した名前')
  })

  it('cancels rename on Escape', () => {
    const onRename = vi.fn()
    renderRow({}, { onRename })
    fireEvent.doubleClick(screen.getByText('テストグループ'))
    const input = screen.getByDisplayValue('テストグループ')
    fireEvent.change(input, { target: { value: '変更しない' } })
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(screen.queryByDisplayValue('変更しない')).not.toBeInTheDocument()
    expect(screen.getByText('テストグループ')).toBeInTheDocument()
    expect(onRename).not.toHaveBeenCalled()
  })

  it('uses original name when empty rename committed', () => {
    const onRename = vi.fn()
    renderRow({}, { onRename })
    fireEvent.doubleClick(screen.getByText('テストグループ'))
    const input = screen.getByDisplayValue('テストグループ')
    fireEvent.change(input, { target: { value: '' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onRename).toHaveBeenCalledWith('テストグループ')
  })
})
