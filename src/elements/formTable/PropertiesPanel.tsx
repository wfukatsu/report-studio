import type {
  FormTableElement,
  FormTableColumn,
  FormTableRow,
  FormTableCell,
  FormTableCellType,
} from '@/types'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput } from '@/elements/_base/sharedUI'
import {
  addColumn,
  removeColumn,
  updateColumn,
  addRow,
  removeRow,
  updateCell,
  updateRow,
  CELL_TYPE_OPTIONS,
  ROW_ROLE_OPTIONS,
  ALIGN_OPTIONS,
} from './tableOperations'

interface Props {
  el: FormTableElement
  onChange: (patch: Partial<FormTableElement>) => void
}

// Constants imported from tableOperations

// ---------------------------------------------------------------------------
// Column editor
// ---------------------------------------------------------------------------

function ColumnEditor({
  col,
  colIdx,
  el,
  onChange,
}: {
  col: FormTableColumn
  colIdx: number
  el: FormTableElement
  onChange: (patch: Partial<FormTableElement>) => void
}) {
  return (
    <div className="border rounded p-2 space-y-1.5 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground">列 {colIdx + 1}</span>
        <button
          title={`列 ${colIdx + 1} 削除`}
          className="text-[10px] text-destructive hover:underline"
          onClick={() => onChange(removeColumn(el, colIdx))}
        >
          削除
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">幅 (mm)</span>
          <input
            type="number"
            min={3}
            step={1}
            className="border rounded px-1.5 py-0.5 text-xs bg-background"
            value={col.width}
            onChange={(e) => onChange(updateColumn(el, colIdx, { width: Math.max(3, Number(e.target.value)) }))}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">横揃え</span>
          <SelectInput
            value={col.align ?? 'left'}
            onChange={(v) => onChange(updateColumn(el, colIdx, { align: v as FormTableColumn['align'] }))}
            options={ALIGN_OPTIONS}
          />
        </label>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Cell editor
// ---------------------------------------------------------------------------

function CellEditor({
  cell,
  colIdx,
  rowIdx,
  el,
  onChange,
}: {
  cell: FormTableCell
  colIdx: number
  rowIdx: number
  el: FormTableElement
  onChange: (patch: Partial<FormTableElement>) => void
}) {
  return (
    <div className="border rounded p-1.5 space-y-1 bg-background">
      <div className="flex items-center gap-1">
        <span className="text-[10px] text-muted-foreground shrink-0">列{colIdx + 1}</span>
        <SelectInput
          value={cell.type}
          onChange={(v) =>
            onChange(updateCell(el, rowIdx, colIdx, { type: v as FormTableCellType }))
          }
          options={CELL_TYPE_OPTIONS}
        />
      </div>
      {cell.type === 'label' && (
        <input
          type="text"
          className="border rounded px-1.5 py-0.5 text-xs bg-background w-full"
          placeholder="ラベルテキスト"
          value={cell.text ?? ''}
          onChange={(e) => onChange(updateCell(el, rowIdx, colIdx, { text: e.target.value }))}
        />
      )}
      {cell.type === 'input' && (
        <input
          type="text"
          className="border rounded px-1.5 py-0.5 text-xs bg-background w-full"
          placeholder="プレースホルダー"
          value={cell.placeholder ?? ''}
          onChange={(e) =>
            onChange(updateCell(el, rowIdx, colIdx, { placeholder: e.target.value }))
          }
        />
      )}
      {cell.type === 'dataField' && (
        <input
          type="text"
          className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono w-full"
          placeholder="field.key"
          value={cell.fieldKey ?? ''}
          onChange={(e) =>
            onChange(updateCell(el, rowIdx, colIdx, { fieldKey: e.target.value }))
          }
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Row editor
// ---------------------------------------------------------------------------

function RowEditor({
  row,
  rowIdx,
  el,
  onChange,
}: {
  row: FormTableRow
  rowIdx: number
  el: FormTableElement
  onChange: (patch: Partial<FormTableElement>) => void
}) {
  const roleLabel = ROW_ROLE_OPTIONS.find((o) => o.value === row.role)?.label ?? row.role

  return (
    <div className="border rounded p-2 space-y-1.5 bg-muted/30">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold text-muted-foreground">
          行 {rowIdx + 1} — {roleLabel}
        </span>
        <button
          title={`行 ${rowIdx + 1} 削除`}
          className="text-[10px] text-destructive hover:underline"
          onClick={() => onChange(removeRow(el, rowIdx))}
        >
          削除
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">行の役割</span>
          <SelectInput
            value={row.role}
            onChange={(v) => onChange(updateRow(el, rowIdx, { role: v as FormTableRow['role'] }))}
            options={ROW_ROLE_OPTIONS}
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] text-muted-foreground">高さ (mm)</span>
          <input
            type="number"
            min={3}
            step={0.5}
            className="border rounded px-1.5 py-0.5 text-xs bg-background"
            value={row.height}
            onChange={(e) =>
              onChange(updateRow(el, rowIdx, { height: Math.max(3, Number(e.target.value)) }))
            }
          />
        </label>
      </div>
      <div className="space-y-1 mt-1">
        {row.cells.map((cell, colIdx) => (
          <CellEditor
            key={cell.id}
            cell={cell}
            colIdx={colIdx}
            rowIdx={rowIdx}
            el={el}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function FormTablePropertiesPanel({ el, onChange }: Props) {
  return (
    <>
      <PropSection title="帳票テーブル — データバインド">
        <div className="rounded bg-blue-50 border border-blue-200 px-2 py-1.5 text-[10px] text-blue-700 leading-snug">
          データソースを設定すると body 行をデータ件数分展開します。未設定の場合は固定レイアウトとして機能します。
        </div>
        <PropRow label="データソース (配列フィールドキー)">
          <input
            type="text"
            className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
            value={el.dataSource ?? ''}
            placeholder="例: items, records"
            onChange={(e) => onChange({ dataSource: e.target.value || undefined })}
          />
        </PropRow>
        <PropRow label="最大件数 (0=無制限)">
          <NumInput
            value={el.maxItems ?? 0}
            onChange={(v) => onChange({ maxItems: Math.max(0, v) })}
            min={0}
          />
        </PropRow>
      </PropSection>

      <PropSection title="帳票テーブル — 列定義">
        <div className="space-y-2">
          {el.columns.map((col, colIdx) => (
            <ColumnEditor key={col.id} col={col} colIdx={colIdx} el={el} onChange={onChange} />
          ))}
          <button
            className="w-full py-1 text-xs text-blue-600 hover:underline border border-dashed rounded"
            onClick={() => onChange(addColumn(el))}
          >
            ＋ 列を追加
          </button>
        </div>
      </PropSection>

      <PropSection title="帳票テーブル — 行定義">
        <div className="space-y-2">
          {el.rows.map((row, rowIdx) => (
            <RowEditor key={row.id} row={row} rowIdx={rowIdx} el={el} onChange={onChange} />
          ))}
          <button
            className="w-full py-1 text-xs text-blue-600 hover:underline border border-dashed rounded"
            onClick={() => onChange(addRow(el))}
          >
            ＋ 行を追加
          </button>
        </div>
      </PropSection>

      <PropSection title="帳票テーブル — 外観">
        <PropRow label="枠線色">
          <ColorInput value={el.borderColor} onChange={(v) => onChange({ borderColor: v })} />
        </PropRow>
        <PropRow label="枠線幅">
          <NumInput
            value={el.borderWidth}
            onChange={(v) => onChange({ borderWidth: v })}
            min={0}
            step={0.1}
            unit="mm"
          />
        </PropRow>
        <PropRow label="奇数行の背景色">
          <ColorInput
            value={el.oddRowColor ?? '#ffffff'}
            onChange={(v) => onChange({ oddRowColor: v })}
          />
        </PropRow>
        <PropRow label="偶数行の背景色（縞模様）">
          <ColorInput
            value={el.evenRowColor ?? '#f9fafb'}
            onChange={(v) => onChange({ evenRowColor: v })}
          />
        </PropRow>
      </PropSection>
    </>
  )
}
