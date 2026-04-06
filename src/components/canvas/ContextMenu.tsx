import { useCallback, useEffect, useRef } from 'react'
import {
  Copy, Scissors, Clipboard, Trash2, Lock, Unlock,
  Eye, EyeOff, BringToFront, SendToBack, ArrowUpToLine, ArrowDownToLine,
  CopyPlus, Folder,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Generic context menu item types (discriminated union)
// ---------------------------------------------------------------------------

export interface ContextMenuAction {
  kind: 'action'
  icon: React.ReactElement | null
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  className?: string
}

export interface ContextMenuSeparator {
  kind: 'separator'
}

export type ContextMenuItemDef = ContextMenuAction | ContextMenuSeparator

// ---------------------------------------------------------------------------
// Canvas-specific state (used when items prop is omitted)
// ---------------------------------------------------------------------------

export interface ContextMenuState {
  x: number
  y: number
  elementId: string
  isLocked: boolean
  isVisible: boolean
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface Props {
  menu: ContextMenuState | null
  pageId: string | undefined
  onClose: () => void
  // Canvas-specific handlers (required when items is not provided)
  onCopy?: () => void
  onCut?: () => void
  onPaste?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  onToggleLock?: () => void
  onToggleVisible?: () => void
  onZOrder?: (order: 'front' | 'back' | 'forward' | 'backward') => void
  onGroup?: () => void
  hasPaste?: boolean
  // Generic items mode — when provided, renders these instead of canvas defaults
  items?: ContextMenuItemDef[]
}

// ---------------------------------------------------------------------------
// Shared MenuItem
// ---------------------------------------------------------------------------

export function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  disabled,
  className,
}: {
  icon: React.ReactNode
  label: string
  shortcut?: string
  onClick: () => void
  disabled?: boolean
  className?: string
}) {
  return (
    <button
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${className ?? ''}`}
    >
      <span className="text-muted-foreground">{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {shortcut && <span className="text-muted-foreground text-[10px]">{shortcut}</span>}
    </button>
  )
}

// ---------------------------------------------------------------------------
// ContextMenu component
// ---------------------------------------------------------------------------

export function ContextMenu({
  menu,
  onClose,
  onCopy,
  onCut,
  onPaste,
  onDuplicate,
  onDelete,
  onToggleLock,
  onToggleVisible,
  onZOrder,
  onGroup,
  hasPaste,
  items,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)

  const getMenuItems = useCallback((): HTMLButtonElement[] => {
    if (!ref.current) return []
    return Array.from(ref.current.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'))
  }, [])

  const focusItem = useCallback((index: number) => {
    const items = getMenuItems()
    if (items.length === 0) return
    const clamped = Math.max(0, Math.min(index, items.length - 1))
    items[clamped].focus()
  }, [getMenuItems])

  // Auto-focus first item on mount
  useEffect(() => {
    if (!menu) return
    const id = requestAnimationFrame(() => focusItem(0))
    return () => cancelAnimationFrame(id)
  }, [menu, focusItem])

  useEffect(() => {
    if (!menu) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menu, onClose])

  useEffect(() => {
    if (!menu) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [menu, onClose])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const menuItems = getMenuItems()
    if (menuItems.length === 0) return
    const active = document.activeElement as HTMLElement
    const currentIndex = menuItems.indexOf(active as HTMLButtonElement)

    switch (e.key) {
      case 'ArrowDown': {
        e.preventDefault()
        const next = currentIndex < menuItems.length - 1 ? currentIndex + 1 : 0
        menuItems[next].focus()
        break
      }
      case 'ArrowUp': {
        e.preventDefault()
        const prev = currentIndex > 0 ? currentIndex - 1 : menuItems.length - 1
        menuItems[prev].focus()
        break
      }
      case 'Home': {
        e.preventDefault()
        menuItems[0].focus()
        break
      }
      case 'End': {
        e.preventDefault()
        menuItems[menuItems.length - 1].focus()
        break
      }
    }
  }, [getMenuItems])

  if (!menu) return null

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        left: menu.x,
        top: menu.y,
        zIndex: 99999,
      }}
      role="menu"
      className="bg-popover border rounded-md shadow-lg py-1 min-w-[160px] text-sm"
      onContextMenu={(e) => e.preventDefault()}
      onKeyDown={handleKeyDown}
    >
      {items ? renderItems(items, onClose) : renderCanvasItems(menu, onClose, {
        onCopy, onCut, onPaste, onDuplicate, onDelete,
        onToggleLock, onToggleVisible, onZOrder, onGroup, hasPaste,
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Generic items renderer
// ---------------------------------------------------------------------------

function renderItems(items: ContextMenuItemDef[], onClose: () => void) {
  return items.map((item, i) => {
    if (item.kind === 'separator') {
      return <div key={i} className="border-t my-1" />
    }
    return (
      <MenuItem
        key={i}
        icon={item.icon}
        label={item.label}
        shortcut={item.shortcut}
        onClick={() => { item.onClick(); onClose() }}
        disabled={item.disabled}
        className={item.className}
      />
    )
  })
}

// ---------------------------------------------------------------------------
// Canvas-specific items renderer (preserves original canvas menu)
// ---------------------------------------------------------------------------

function renderCanvasItems(
  menu: ContextMenuState,
  onClose: () => void,
  handlers: {
    onCopy?: () => void
    onCut?: () => void
    onPaste?: () => void
    onDuplicate?: () => void
    onDelete?: () => void
    onToggleLock?: () => void
    onToggleVisible?: () => void
    onZOrder?: (order: 'front' | 'back' | 'forward' | 'backward') => void
    onGroup?: () => void
    hasPaste?: boolean
  },
) {
  const { onCopy, onCut, onPaste, onDuplicate, onDelete, onToggleLock, onToggleVisible, onZOrder, onGroup, hasPaste } = handlers
  return (
    <>
      <MenuItem icon={<Copy className="w-3.5 h-3.5" />} label="コピー" shortcut="⌘C" onClick={() => { onCopy?.(); onClose() }} />
      <MenuItem icon={<Scissors className="w-3.5 h-3.5" />} label="カット" shortcut="⌘X" onClick={() => { onCut?.(); onClose() }} />
      <MenuItem icon={<Clipboard className="w-3.5 h-3.5" />} label="ペースト" shortcut="⌘V" onClick={() => { onPaste?.(); onClose() }} disabled={!hasPaste} />
      <MenuItem icon={<CopyPlus className="w-3.5 h-3.5" />} label="複製" shortcut="⌘D" onClick={() => { onDuplicate?.(); onClose() }} />

      {onGroup && (
        <>
          <div className="border-t my-1" />
          <MenuItem icon={<Folder className="w-3.5 h-3.5" />} label="グループ化" shortcut="⌘G" onClick={() => { onGroup(); onClose() }} />
        </>
      )}

      <div className="border-t my-1" />

      <MenuItem icon={<BringToFront className="w-3.5 h-3.5" />} label="最前面へ" onClick={() => { onZOrder?.('front'); onClose() }} />
      <MenuItem icon={<ArrowUpToLine className="w-3.5 h-3.5" />} label="前面へ" onClick={() => { onZOrder?.('forward'); onClose() }} />
      <MenuItem icon={<ArrowDownToLine className="w-3.5 h-3.5" />} label="背面へ" onClick={() => { onZOrder?.('backward'); onClose() }} />
      <MenuItem icon={<SendToBack className="w-3.5 h-3.5" />} label="最背面へ" onClick={() => { onZOrder?.('back'); onClose() }} />

      <div className="border-t my-1" />

      <MenuItem
        icon={menu.isVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        label={menu.isVisible ? '非表示' : '表示'}
        onClick={() => { onToggleVisible?.(); onClose() }}
      />
      <MenuItem
        icon={menu.isLocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
        label={menu.isLocked ? 'ロック解除' : 'ロック'}
        onClick={() => { onToggleLock?.(); onClose() }}
      />

      <div className="border-t my-1" />

      <MenuItem
        icon={<Trash2 className="w-3.5 h-3.5 text-destructive" />}
        label="削除"
        shortcut="⌫"
        onClick={() => { onDelete?.(); onClose() }}
        className="text-destructive"
      />
    </>
  )
}
