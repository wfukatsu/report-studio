import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextMenu, MenuItem, type ContextMenuState, type ContextMenuItemDef } from './ContextMenu'

const menu: ContextMenuState = {
  x: 100,
  y: 200,
  elementId: 'el-1',
  isLocked: false,
  isVisible: true,
}

function renderMenu(overrides: Partial<ContextMenuState> = {}) {
  const props = {
    menu: { ...menu, ...overrides },
    pageId: 'page-1',
    onClose: vi.fn(),
    onCopy: vi.fn(),
    onCut: vi.fn(),
    onPaste: vi.fn(),
    onDuplicate: vi.fn(),
    onDelete: vi.fn(),
    onToggleLock: vi.fn(),
    onToggleVisible: vi.fn(),
    onZOrder: vi.fn(),
    hasPaste: true,
  }
  const result = render(<ContextMenu {...props} />)
  return { ...result, props }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// MenuItem component
// ---------------------------------------------------------------------------

describe('MenuItem', () => {
  it('renders label', () => {
    render(<MenuItem icon={null} label="テスト" onClick={vi.fn()} />)
    expect(screen.getByText('テスト')).toBeInTheDocument()
  })

  it('renders shortcut when provided', () => {
    render(<MenuItem icon={null} label="テスト" shortcut="⌘C" onClick={vi.fn()} />)
    expect(screen.getByText('⌘C')).toBeInTheDocument()
  })

  it('calls onClick when clicked', () => {
    const onClick = vi.fn()
    render(<MenuItem icon={null} label="クリック" onClick={onClick} />)
    fireEvent.click(screen.getByRole('menuitem'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('is disabled when disabled=true', () => {
    render(<MenuItem icon={null} label="無効" onClick={vi.fn()} disabled={true} />)
    expect(screen.getByRole('menuitem')).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// ContextMenu — not rendered when menu is null
// ---------------------------------------------------------------------------

describe('ContextMenu — 非表示', () => {
  it('renders nothing when menu is null', () => {
    const { container } = render(<ContextMenu menu={null} pageId="p1" onClose={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// ContextMenu — handler tests
// ---------------------------------------------------------------------------

describe('ContextMenu — ハンドラーテスト', () => {
  it('calls onCopy when コピー is clicked', () => {
    const onCopy = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onCopy={onCopy} hasPaste={true} />)
    fireEvent.click(screen.getByText('コピー'))
    expect(onCopy).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onCut when カット is clicked', () => {
    const onCut = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onCut={onCut} />)
    fireEvent.click(screen.getByText('カット'))
    expect(onCut).toHaveBeenCalledTimes(1)
  })

  it('calls onDelete when 削除 is clicked', () => {
    const onDelete = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onDelete={onDelete} />)
    fireEvent.click(screen.getByText('削除'))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })

  it('calls onDuplicate when 複製 is clicked', () => {
    const onDuplicate = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onDuplicate={onDuplicate} />)
    fireEvent.click(screen.getByText('複製'))
    expect(onDuplicate).toHaveBeenCalledTimes(1)
  })

  it('calls onToggleVisible when 非表示 is clicked', () => {
    const onToggleVisible = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onToggleVisible={onToggleVisible} />)
    fireEvent.click(screen.getByText('非表示'))
    expect(onToggleVisible).toHaveBeenCalledTimes(1)
  })

  it('shows 表示 when element is not visible', () => {
    const hiddenMenu = { ...menu, isVisible: false }
    render(<ContextMenu menu={hiddenMenu} pageId="p1" onClose={vi.fn()} />)
    expect(screen.getByText('表示')).toBeInTheDocument()
  })

  it('calls onToggleLock when ロック is clicked', () => {
    const onToggleLock = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onToggleLock={onToggleLock} />)
    fireEvent.click(screen.getByText('ロック'))
    expect(onToggleLock).toHaveBeenCalledTimes(1)
  })

  it('shows ロック解除 when element is locked', () => {
    const lockedMenu = { ...menu, isLocked: true }
    render(<ContextMenu menu={lockedMenu} pageId="p1" onClose={vi.fn()} />)
    expect(screen.getByText('ロック解除')).toBeInTheDocument()
  })

  it('calls onZOrder(front) when 最前面へ is clicked', () => {
    const onZOrder = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onZOrder={onZOrder} />)
    fireEvent.click(screen.getByText('最前面へ'))
    expect(onZOrder).toHaveBeenCalledWith('front')
  })

  it('calls onZOrder(back) when 最背面へ is clicked', () => {
    const onZOrder = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onZOrder={onZOrder} />)
    fireEvent.click(screen.getByText('最背面へ'))
    expect(onZOrder).toHaveBeenCalledWith('back')
  })

  it('calls onZOrder(forward) when 前面へ is clicked', () => {
    const onZOrder = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onZOrder={onZOrder} />)
    fireEvent.click(screen.getByText('前面へ'))
    expect(onZOrder).toHaveBeenCalledWith('forward')
  })

  it('calls onZOrder(backward) when 背面へ is clicked', () => {
    const onZOrder = vi.fn()
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} onZOrder={onZOrder} />)
    fireEvent.click(screen.getByText('背面へ'))
    expect(onZOrder).toHaveBeenCalledWith('backward')
  })

  it('shows ペースト disabled when hasPaste is false', () => {
    render(<ContextMenu menu={menu} pageId="p1" onClose={vi.fn()} hasPaste={false} />)
    const pasteButton = screen.getByText('ペースト').closest('button')
    expect(pasteButton).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// ContextMenu — generic items mode
// ---------------------------------------------------------------------------

describe('ContextMenu — 汎用アイテムモード', () => {
  const customItems: ContextMenuItemDef[] = [
    { kind: 'action', icon: null, label: 'アクション1', onClick: vi.fn() },
    { kind: 'separator' },
    { kind: 'action', icon: null, label: 'アクション2', onClick: vi.fn(), disabled: true },
  ]

  it('renders custom items when items prop is provided', () => {
    render(<ContextMenu menu={menu} pageId="p1" onClose={vi.fn()} items={customItems} />)
    expect(screen.getByText('アクション1')).toBeInTheDocument()
    expect(screen.getByText('アクション2')).toBeInTheDocument()
  })

  it('renders separator between items', () => {
    const { container } = render(<ContextMenu menu={menu} pageId="p1" onClose={vi.fn()} items={customItems} />)
    expect(container.querySelector('.border-t')).toBeTruthy()
  })

  it('calls item onClick and onClose when action clicked', () => {
    const actionOnClick = vi.fn()
    const onClose = vi.fn()
    const items: ContextMenuItemDef[] = [
      { kind: 'action', icon: null, label: '実行', onClick: actionOnClick },
    ]
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} items={items} />)
    fireEvent.click(screen.getByText('実行'))
    expect(actionOnClick).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not show canvas-specific items when items prop provided', () => {
    render(<ContextMenu menu={menu} pageId="p1" onClose={vi.fn()} items={customItems} />)
    expect(screen.queryByText('コピー')).not.toBeInTheDocument()
  })
})

describe('ContextMenu — クローズ動作', () => {
  it('calls onClose when clicking outside', () => {
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} />)
    fireEvent.mouseDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(<ContextMenu menu={menu} pageId="p1" onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('ContextMenu accessibility', () => {
  it('renders with role="menu" on container', () => {
    renderMenu()
    expect(screen.getByRole('menu')).toBeInTheDocument()
  })

  it('renders menu items with role="menuitem"', () => {
    renderMenu()
    const items = screen.getAllByRole('menuitem')
    expect(items.length).toBeGreaterThanOrEqual(10)
  })

  it('auto-focuses first enabled menu item on mount', async () => {
    renderMenu()
    // requestAnimationFrame is used, flush it
    await vi.waitFor(() => {
      const items = screen.getAllByRole('menuitem')
      expect(document.activeElement).toBe(items[0])
    })
  })

  it('navigates down with ArrowDown and wraps around', async () => {
    const user = userEvent.setup()
    renderMenu()

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0])
    })

    const items = screen.getAllByRole('menuitem')

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[1])

    await user.keyboard('{ArrowDown}')
    expect(document.activeElement).toBe(items[2])
  })

  it('navigates up with ArrowUp and wraps around', async () => {
    const user = userEvent.setup()
    renderMenu()

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0])
    })

    const items = screen.getAllByRole('menuitem')
    // ArrowUp from first item wraps to last
    await user.keyboard('{ArrowUp}')
    expect(document.activeElement).toBe(items[items.length - 1])
  })

  it('Home focuses first item, End focuses last item', async () => {
    const user = userEvent.setup()
    renderMenu()

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0])
    })

    const items = screen.getAllByRole('menuitem')

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}')
    expect(document.activeElement).toBe(items[3])

    await user.keyboard('{End}')
    expect(document.activeElement).toBe(items[items.length - 1])

    await user.keyboard('{Home}')
    expect(document.activeElement).toBe(items[0])
  })

  it('Enter activates focused menu item', async () => {
    const user = userEvent.setup()
    const { props } = renderMenu()

    await vi.waitFor(() => {
      expect(document.activeElement).toBe(screen.getAllByRole('menuitem')[0])
    })

    // First item is "コピー" (Copy)
    await user.keyboard('{Enter}')
    expect(props.onCopy).toHaveBeenCalledOnce()
    expect(props.onClose).toHaveBeenCalled()
  })

  it('skips disabled items during arrow navigation', async () => {
    const user = userEvent.setup()
    // hasPaste=false disables the paste menu item (3rd item)
    const props = {
      menu,
      pageId: 'page-1',
      onClose: vi.fn(),
      onCopy: vi.fn(),
      onCut: vi.fn(),
      onPaste: vi.fn(),
      onDuplicate: vi.fn(),
      onDelete: vi.fn(),
      onToggleLock: vi.fn(),
      onToggleVisible: vi.fn(),
      onZOrder: vi.fn(),
      hasPaste: false,
    }
    render(<ContextMenu {...props} />)

    await vi.waitFor(() => {
      const items = screen.getAllByRole('menuitem')
      expect(document.activeElement).toBe(items[0])
    })

    // Navigate down twice: should skip the disabled paste item
    await user.keyboard('{ArrowDown}')
    await user.keyboard('{ArrowDown}')

    // Active element should not be a disabled button
    expect((document.activeElement as HTMLButtonElement).disabled).not.toBe(true)
  })
})
