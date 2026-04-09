import { memo, useCallback, useEffect, useRef } from 'react'
import type { FormTableElement, FormTableCell, FormTableCellType } from '@/types'
import { updateCellById, CELL_TYPE_OPTIONS, ALIGN_OPTIONS } from './tableOperations'

interface Props {
  element: FormTableElement
  cellId: string
  onChange: (patch: Partial<FormTableElement>) => void
  onClose: () => void
}

/** Find a cell by ID in the element */
function findCell(el: FormTableElement, cellId: string): FormTableCell | null {
  for (const row of el.rows) {
    for (const cell of row.cells) {
      if (cell.id === cellId) return cell
    }
  }
  return null
}

export const CellPopover = memo(function CellPopover({
  element: el,
  cellId,
  onChange,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const cell = findCell(el, cellId)

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Use setTimeout to avoid the opening click from immediately closing
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', handler, true)
    return () => document.removeEventListener('keydown', handler, true)
  }, [onClose])

  const update = useCallback(
    (patch: Partial<FormTableCell>) => {
      onChange(updateCellById(el, cellId, patch))
    },
    [el, cellId, onChange],
  )

  if (!cell) return null

  return (
    <div
      ref={ref}
      style={{
        position: 'absolute',
        top: 0,
        left: '100%',
        marginLeft: 8,
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: 6,
        padding: 10,
        boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
        zIndex: 100,
        fontSize: '11px',
        minWidth: 200,
        maxWidth: 260,
      }}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 12 }}>セル編集</div>

      {/* Cell type */}
      <label style={{ display: 'block', marginBottom: 6 }}>
        <span style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>タイプ</span>
        <select
          value={cell.type}
          onChange={(e) => update({ type: e.target.value as FormTableCellType })}
          style={selectStyle}
        >
          {CELL_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* Type-specific fields */}
      {cell.type === 'label' && (
        <label style={{ display: 'block', marginBottom: 6 }}>
          <span style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>テキスト</span>
          <input
            type="text"
            value={cell.text ?? ''}
            onChange={(e) => update({ text: e.target.value })}
            placeholder="ラベルテキスト"
            style={inputStyle}
            autoFocus
          />
        </label>
      )}

      {cell.type === 'input' && (
        <label style={{ display: 'block', marginBottom: 6 }}>
          <span style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>プレースホルダー</span>
          <input
            type="text"
            value={cell.placeholder ?? ''}
            onChange={(e) => update({ placeholder: e.target.value })}
            placeholder="プレースホルダー"
            style={inputStyle}
            autoFocus
          />
        </label>
      )}

      {cell.type === 'dataField' && (
        <>
          <label style={{ display: 'block', marginBottom: 6 }}>
            <span style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>フィールドキー</span>
            <input
              type="text"
              value={cell.fieldKey ?? ''}
              onChange={(e) => update({ fieldKey: e.target.value })}
              placeholder="field.key"
              style={{ ...inputStyle, fontFamily: 'monospace' }}
              autoFocus
            />
          </label>
          <label style={{ display: 'block', marginBottom: 6 }}>
            <span style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>フォールバック</span>
            <input
              type="text"
              value={cell.fallbackText ?? ''}
              onChange={(e) => update({ fallbackText: e.target.value })}
              placeholder="データなし時のテキスト"
              style={inputStyle}
            />
          </label>
        </>
      )}

      {/* Alignment */}
      <label style={{ display: 'block', marginBottom: 6 }}>
        <span style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>配置</span>
        <select
          value={cell.style?.textAlign ?? 'left'}
          onChange={(e) =>
            update({
              style: { ...cell.style, textAlign: e.target.value as 'left' | 'center' | 'right' },
            })
          }
          style={selectStyle}
        >
          {ALIGN_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </label>

      {/* Background color */}
      <label style={{ display: 'block', marginBottom: 6 }}>
        <span style={{ color: '#6b7280', display: 'block', marginBottom: 2 }}>背景色</span>
        <input
          type="color"
          value={cell.style?.backgroundColor ?? '#ffffff'}
          onChange={(e) =>
            update({
              style: { ...cell.style, backgroundColor: e.target.value },
            })
          }
          style={{ width: '100%', height: 24, border: '1px solid #d1d5db', borderRadius: 3, cursor: 'pointer' }}
        />
      </label>

      {/* Font weight toggle */}
      <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <input
          type="checkbox"
          checked={cell.style?.fontWeight === 'bold'}
          onChange={(e) =>
            update({
              style: { ...cell.style, fontWeight: e.target.checked ? 'bold' : undefined },
            })
          }
        />
        <span style={{ color: '#6b7280' }}>太字</span>
      </label>
    </div>
  )
})

// ---------------------------------------------------------------------------
// Shared inline styles
// ---------------------------------------------------------------------------

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 11,
  boxSizing: 'border-box',
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid #d1d5db',
  borderRadius: 3,
  padding: '3px 6px',
  fontSize: 11,
  boxSizing: 'border-box',
  background: 'white',
}
