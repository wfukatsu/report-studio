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

<<<<<<< HEAD
// ---------------------------------------------------------------------------
// Helpers — column/row sync (column list is the authority)
// ---------------------------------------------------------------------------

/** Add a new column and append a matching cell to every existing row. */
function addColumn(el: FormTableElement): Partial<FormTableElement> {
  const newCol: FormTableColumn = { id: uuidv4(), width: 20, align: 'left' }
  const newCell = (): FormTableCell => ({ id: uuidv4(), type: 'input', placeholder: '' })
  return {
    columns: [...el.columns, newCol],
    rows: el.rows.map((r) => ({ ...r, cells: [...r.cells, newCell()] })),
  }
}

/** Remove a column by index and remove the matching cell from every row. */
function removeColumn(el: FormTableElement, colIdx: number): Partial<FormTableElement> {
  return {
    columns: el.columns.filter((_, i) => i !== colIdx),
    rows: el.rows.map((r) => ({ ...r, cells: r.cells.filter((_, i) => i !== colIdx) })),
  }
}

/** Patch a single column; replace the columns array entirely (immutable). */
function updateColumn(
  el: FormTableElement,
  colIdx: number,
  patch: Partial<FormTableColumn>,
): Partial<FormTableElement> {
  return {
    columns: el.columns.map((c, i): FormTableColumn => (i === colIdx ? { ...c, ...patch } : c)),
  }
}

/** Add a new body row with cells matching the current column count. */
function addRow(el: FormTableElement): Partial<FormTableElement> {
  const newRow: FormTableRow = {
    id: uuidv4(),
    role: 'body',
    height: 8,
    cells: el.columns.map(() => ({ id: uuidv4(), type: 'input' as const, placeholder: '' })),
  }
  return { rows: [...el.rows, newRow] }
}

/** Remove a row by index. */
function removeRow(el: FormTableElement, rowIdx: number): Partial<FormTableElement> {
  return { rows: el.rows.filter((_, i) => i !== rowIdx) }
}

/** Patch a cell within a row. */
function updateCell(
  el: FormTableElement,
  rowIdx: number,
  colIdx: number,
  patch: Partial<FormTableCell>,
): Partial<FormTableElement> {
  return {
    rows: el.rows.map((r, ri): FormTableRow =>
      ri === rowIdx
        ? { ...r, cells: r.cells.map((c, ci): FormTableCell => (ci === colIdx ? { ...c, ...patch } : c)) }
        : r,
    ),
  }
}

/** Patch a row's non-cell fields. */
function updateRow(
  el: FormTableElement,
  rowIdx: number,
  patch: Omit<Partial<FormTableRow>, 'cells'>,
): Partial<FormTableElement> {
  return {
    rows: el.rows.map((r, i): FormTableRow => (i === rowIdx ? { ...r, ...patch } : r)),
  }
}

// ---------------------------------------------------------------------------
// Cell type label helper
// ---------------------------------------------------------------------------

const CELL_TYPE_OPTIONS = [
  { value: 'label', label: 'ラベル（固定テキスト）' },
  { value: 'input', label: '記入欄（手入力）' },
  { value: 'dataField', label: 'データフィールド' },
  { value: 'checkbox', label: 'チェックボックス' },
  { value: 'eraSelect', label: '元号選択' },
]

const CHECKMARK_OPTIONS = [
  { value: '✓', label: '✓ チェック' },
  { value: '×', label: '× バツ' },
  { value: '●', label: '● 丸' },
]

const ERA_LAYOUT_OPTIONS = [
  { value: 'column', label: '縦1列' },
  { value: 'row', label: '横1行' },
  { value: 'grid-2col', label: '2列グリッド' },
]

const ROW_ROLE_OPTIONS = [
  { value: 'header', label: 'ヘッダー' },
  { value: 'body', label: 'ボディ（繰り返し）' },
  { value: 'footer', label: 'フッター' },
]

const ALIGN_OPTIONS = [
  { value: 'left', label: '左' },
  { value: 'center', label: '中央' },
  { value: 'right', label: '右' },
]
=======
// Constants imported from tableOperations
>>>>>>> feat/formtable-excel-editing

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
      {cell.type === 'checkbox' && (
        <div className="space-y-1">
          <SelectInput
            value={cell.checkmark ?? '✓'}
            onChange={(v) => onChange(updateCell(el, rowIdx, colIdx, { checkmark: v as '✓' | '×' | '●' }))}
            options={CHECKMARK_OPTIONS}
          />
          <input
            type="text"
            className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono w-full"
            placeholder="dataSource（バインド先フィールドキー）"
            value={cell.checkboxDataSource ?? ''}
            onChange={(e) =>
              onChange(updateCell(el, rowIdx, colIdx, { checkboxDataSource: e.target.value || undefined }))
            }
          />
        </div>
      )}
      {cell.type === 'eraSelect' && (
        <div className="space-y-1">
          <SelectInput
            value={cell.eraLayout ?? 'row'}
            onChange={(v) => onChange(updateCell(el, rowIdx, colIdx, { eraLayout: v as 'column' | 'row' | 'grid-2col' }))}
            options={ERA_LAYOUT_OPTIONS}
          />
          <input
            type="text"
            className="border rounded px-1.5 py-0.5 text-xs bg-background font-mono w-full"
            placeholder="dataSource（元号バインド先フィールドキー）"
            value={cell.eraDataSource ?? ''}
            onChange={(e) =>
              onChange(updateCell(el, rowIdx, colIdx, { eraDataSource: e.target.value || undefined }))
            }
          />
        </div>
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
