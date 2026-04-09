import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import type { FormTableElement } from '@/types'
import { ContextMenu, type ContextMenuItemDef } from '@/components/canvas/ContextMenu'
import {
  insertRowAt,
  insertColumnAt,
  removeRow,
  removeColumn,
  moveRow,
  moveColumn,
} from './tableOperations'
import type { CellCoord } from './tableEditState'

interface Props {
  element: FormTableElement
  menu: { x: number; y: number } | null
  cellCoord: CellCoord | null
  onChange: (patch: Partial<FormTableElement>) => void
  onClose: () => void
}

export function TableContextMenu({
  element: el,
  menu,
  cellCoord,
  onChange,
  onClose,
}: Props) {
  const items = useMemo((): ContextMenuItemDef[] => {
    if (!cellCoord) return []

    const { row, col } = cellCoord
    const isLastRow = el.rows.length <= 1
    const isLastCol = el.columns.length <= 1
    const canMoveRowUp = row > 0
    const canMoveRowDown = row < el.rows.length - 1
    const canMoveColLeft = col > 0
    const canMoveColRight = col < el.columns.length - 1

    return [
      // Row operations
      {
        kind: 'action',
        icon: null,
        label: '上に行を挿入',
        onClick: () => onChange(insertRowAt(el, row, 'before')),
      },
      {
        kind: 'action',
        icon: null,
        label: '下に行を挿入',
        onClick: () => onChange(insertRowAt(el, row, 'after')),
      },
      {
        kind: 'action',
        icon: null,
        label: '行を削除',
        onClick: () => onChange(removeRow(el, row)),
        disabled: isLastRow,
      },
      {
        kind: 'action',
        icon: null,
        label: '行を上に移動',
        onClick: () => onChange(moveRow(el, row, row - 1)),
        disabled: !canMoveRowUp,
      },
      {
        kind: 'action',
        icon: null,
        label: '行を下に移動',
        onClick: () => onChange(moveRow(el, row, row + 1)),
        disabled: !canMoveRowDown,
      },
      { kind: 'separator' },
      // Column operations
      {
        kind: 'action',
        icon: null,
        label: '左に列を挿入',
        onClick: () => onChange(insertColumnAt(el, col, 'before')),
      },
      {
        kind: 'action',
        icon: null,
        label: '右に列を挿入',
        onClick: () => onChange(insertColumnAt(el, col, 'after')),
      },
      {
        kind: 'action',
        icon: null,
        label: '列を削除',
        onClick: () => onChange(removeColumn(el, col)),
        disabled: isLastCol,
      },
      {
        kind: 'action',
        icon: null,
        label: '列を左に移動',
        onClick: () => onChange(moveColumn(el, col, col - 1)),
        disabled: !canMoveColLeft,
      },
      {
        kind: 'action',
        icon: null,
        label: '列を右に移動',
        onClick: () => onChange(moveColumn(el, col, col + 1)),
        disabled: !canMoveColRight,
      },
    ]
  }, [el, cellCoord, onChange])

  if (!menu || !cellCoord) return null

  // Clamp menu position to stay within viewport
  const menuWidth = 180
  const menuHeight = 320
  const clampedX = Math.min(menu.x, window.innerWidth - menuWidth)
  const clampedY = Math.min(menu.y, window.innerHeight - menuHeight)

  // Portal to document.body to escape stacking context of FormTableEditor
  return createPortal(
    <ContextMenu
      menu={{ x: Math.max(0, clampedX), y: Math.max(0, clampedY), elementId: '', isLocked: false, isVisible: true }}
      pageId={undefined}
      onClose={onClose}
      items={items}
    />,
    document.body,
  )
}
