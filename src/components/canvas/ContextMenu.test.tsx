import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ContextMenu, type ContextMenuState } from './ContextMenu'

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
