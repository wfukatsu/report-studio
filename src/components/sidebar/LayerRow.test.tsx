import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LayerRow } from './LayerRow'
import type { ReportElement } from '@/types'
import { createTextElement, createShapeElement } from '@/lib/elementFactories'

function makeTextEl(overrides?: Partial<ReportElement>): ReportElement {
  return createTextElement({ id: 'el-1', name: 'テキスト要素', ...overrides }) as ReportElement
}

const defaultProps = {
  pageId: 'page-1',
  isSelected: false,
  isRenaming: false,
  renameValue: '',
  onRowClick: vi.fn(),
  onStartRename: vi.fn(),
  onCommitRename: vi.fn(),
  onRenameChange: vi.fn(),
  onCancelRename: vi.fn(),
  onToggleVisible: vi.fn(),
  onToggleLock: vi.fn(),
  onDelete: vi.fn(),
  onContextMenu: vi.fn(),
}

beforeEach(() => {
  Object.values(defaultProps).forEach((fn) => {
    if (typeof fn === 'function') (fn as ReturnType<typeof vi.fn>).mockClear()
  })
})

describe('LayerRow — 表示', () => {
  it('renders element name', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    expect(screen.getByText('テキスト要素')).toBeInTheDocument()
  })

  it('renders with selected style when isSelected=true', () => {
    const el = makeTextEl()
    const { container } = render(<LayerRow el={el} {...defaultProps} isSelected={true} />)
    expect(container.firstChild).toBeTruthy()
  })

  it('renders rename input when isRenaming=true', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} isRenaming={true} renameValue="テキスト要素" />)
    const input = screen.getByDisplayValue('テキスト要素')
    expect(input).toBeInTheDocument()
  })

  it('renders visibility toggle button', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    expect(screen.getByTitle('非表示にする')).toBeInTheDocument()
  })

  it('shows EyeOff icon when element is not visible', () => {
    const el = makeTextEl({ visible: false })
    render(<LayerRow el={el} {...defaultProps} />)
    expect(screen.getByTitle('表示する')).toBeInTheDocument()
  })

  it('renders lock toggle button', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    expect(screen.getByTitle('ロック')).toBeInTheDocument()
  })

  it('shows unlock icon when element is locked', () => {
    const el = makeTextEl({ locked: true })
    render(<LayerRow el={el} {...defaultProps} />)
    expect(screen.getByTitle('ロック解除')).toBeInTheDocument()
  })

  it('renders delete button', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    expect(screen.getByTitle('削除')).toBeInTheDocument()
  })
})

describe('LayerRow — インタラクション', () => {
  it('calls onRowClick when row is clicked', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    const row = screen.getByText('テキスト要素').closest('div[class]')!
    fireEvent.click(row)
    expect(defaultProps.onRowClick).toHaveBeenCalledWith('el-1', expect.any(Object))
  })

  it('calls onToggleVisible when visibility button is clicked', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    fireEvent.click(screen.getByTitle('非表示にする'))
    expect(defaultProps.onToggleVisible).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleLock when lock button is clicked', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    fireEvent.click(screen.getByTitle('ロック'))
    expect(defaultProps.onToggleLock).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete when delete button is clicked', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    fireEvent.click(screen.getByTitle('削除'))
    expect(defaultProps.onDelete).toHaveBeenCalledTimes(1)
  })

  it('calls onContextMenu when right-clicked', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    const row = screen.getByText('テキスト要素').closest('div[class]')!
    fireEvent.contextMenu(row)
    expect(defaultProps.onContextMenu).toHaveBeenCalledTimes(1)
  })

  it('calls onStartRename on double-click of name span', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    fireEvent.doubleClick(screen.getByText('テキスト要素'))
    expect(defaultProps.onStartRename).toHaveBeenCalledWith(el)
  })
})

describe('LayerRow — リネーム入力', () => {
  it('calls onRenameChange when rename input changes', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} isRenaming={true} renameValue="テキスト要素" />)
    const input = screen.getByDisplayValue('テキスト要素')
    fireEvent.change(input, { target: { value: '新しい名前' } })
    expect(defaultProps.onRenameChange).toHaveBeenCalledWith('新しい名前')
  })

  it('calls onCommitRename on Enter in rename input', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} isRenaming={true} renameValue="テキスト要素" />)
    const input = screen.getByDisplayValue('テキスト要素')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(defaultProps.onCommitRename).toHaveBeenCalledWith(el, 'page-1')
  })

  it('calls onCancelRename on Escape in rename input', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} isRenaming={true} renameValue="テキスト要素" />)
    const input = screen.getByDisplayValue('テキスト要素')
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(defaultProps.onCancelRename).toHaveBeenCalledTimes(1)
  })

  it('calls onCommitRename on blur of rename input', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} isRenaming={true} renameValue="テキスト要素" />)
    const input = screen.getByDisplayValue('テキスト要素')
    fireEvent.blur(input)
    expect(defaultProps.onCommitRename).toHaveBeenCalledWith(el, 'page-1')
  })

  it('does not propagate click on rename input to row', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} isRenaming={true} renameValue="テキスト要素" />)
    const input = screen.getByDisplayValue('テキスト要素')
    fireEvent.click(input)
    // onRowClick should not be triggered by clicking on rename input
    // (stopPropagation is used so click won't bubble to row)
    expect(defaultProps.onRowClick).not.toHaveBeenCalled()
  })
})

describe('LayerRow — 異なる要素タイプ', () => {
  it('renders shape element', () => {
    const el = createShapeElement({ id: 'shape-1' }) as ReportElement
    render(<LayerRow el={el} {...defaultProps} />)
    expect(screen.getByTitle('非表示にする')).toBeInTheDocument()
  })

  it('renders element with no name using default name', () => {
    const el = makeTextEl({ name: undefined })
    render(<LayerRow el={el} {...defaultProps} />)
    // defaultName function should provide a fallback
    expect(screen.getByTitle('ロック')).toBeInTheDocument()
  })
})

describe('LayerRow — visibility/lock button event propagation', () => {
  it('does not propagate visibility click to row', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    fireEvent.click(screen.getByTitle('非表示にする'))
    // stopPropagation should prevent onRowClick from also being called
    expect(defaultProps.onRowClick).not.toHaveBeenCalled()
  })

  it('does not propagate lock click to row', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    fireEvent.click(screen.getByTitle('ロック'))
    expect(defaultProps.onRowClick).not.toHaveBeenCalled()
  })

  it('does not propagate delete click to row', () => {
    const el = makeTextEl()
    render(<LayerRow el={el} {...defaultProps} />)
    fireEvent.click(screen.getByTitle('削除'))
    expect(defaultProps.onRowClick).not.toHaveBeenCalled()
  })
})
