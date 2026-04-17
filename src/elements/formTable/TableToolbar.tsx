import { memo, useMemo, useRef, useState, useEffect } from 'react'
import type { FormTableElement } from '@/types'
import { canMerge, mergeCells, splitCell } from './tableMerge'
import { addRow, addColumn } from './tableOperations'

interface Props {
  element: FormTableElement
  selectedCells: Set<string>
  activeCell: string | null
  onChange: (patch: Partial<FormTableElement>) => void
}

export const TableToolbar = memo(function TableToolbar({
  element: el,
  selectedCells,
  activeCell,
  onChange,
}: Props) {
  const mergeCheck = useMemo(
    () => canMerge(el, selectedCells),
    [el, selectedCells],
  )

  // Check if active cell is a merged master cell
  const isMergedCell = useMemo(() => {
    if (!activeCell) return false
    for (const row of el.rows) {
      for (const cell of row.cells) {
        if (cell.id === activeCell) {
          return (cell.colspan ?? 1) > 1 || (cell.rowspan ?? 1) > 1
        }
      }
    }
    return false
  }, [el, activeCell])

  // Determine if toolbar should appear below instead of above
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [showBelow, setShowBelow] = useState(false)

  useEffect(() => {
    if (!toolbarRef.current) return
    const rect = toolbarRef.current.getBoundingClientRect()
    // If toolbar is above the viewport top, flip to below
    setShowBelow(rect.top < 0)
  })

  return (
    <div
      ref={toolbarRef}
      style={{
        position: 'absolute',
        ...(showBelow ? { bottom: -32 } : { top: -32 }),
        left: 0,
        display: 'flex',
        gap: 4,
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 4,
        padding: '2px 4px',
        boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
        zIndex: 60,
        fontSize: 11,
      }}
    >
      <ToolbarButton
        label="結合"
        disabled={!mergeCheck.valid}
        title={mergeCheck.reason ?? 'セルを結合'}
        onClick={() => onChange(mergeCells(el, selectedCells))}
      />
      <ToolbarButton
        label="分割"
        disabled={!isMergedCell || !activeCell}
        title="結合を解除"
        onClick={() => activeCell && onChange(splitCell(el, activeCell))}
      />
      <Separator />
      <ToolbarButton
        label="+ 行"
        onClick={() => onChange(addRow(el))}
        title="行を追加"
      />
      <ToolbarButton
        label="+ 列"
        onClick={() => onChange(addColumn(el))}
        title="列を追加"
      />
    </div>
  )
})

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ToolbarButton({
  label,
  disabled,
  title,
  onClick,
}: {
  label: string
  disabled?: boolean
  title?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      disabled={disabled}
      title={title}
      style={{
        padding: '2px 8px',
        border: '1px solid #d1d5db',
        borderRadius: 3,
        background: disabled ? '#f9fafb' : 'white',
        color: disabled ? '#9ca3af' : '#374151',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 11,
        fontWeight: 500,
        lineHeight: '18px',
      }}
    >
      {label}
    </button>
  )
}

function Separator() {
  return (
    <div
      style={{
        width: 1,
        background: '#e5e7eb',
        margin: '2px 2px',
      }}
    />
  )
}
