/**
 * FieldColumnMap / FieldColumnRow — per-field column selection inside
 * GroupBindingSection. Extracted from DbConnectionTab.tsx in Phase 1.5.
 */
import type { ScalarDbCatalogTable } from '@/api/reportApi'
import type { SchemaField } from '@/types'

export interface FieldColumnMapProps {
  groupId: string
  fields: SchemaField[]
  table: ScalarDbCatalogTable
  onColumnChange: (fieldId: string, columnName: string) => void
}

export function FieldColumnMap({ groupId, fields, table, onColumnChange }: FieldColumnMapProps) {
  if (fields.length === 0) {
    return (
      <p className="text-[10px] text-muted-foreground pl-1">
        このグループにはフィールドがありません。
      </p>
    )
  }

  return (
    <div className="border-t border-border pt-2">
      <div className="text-[10px] text-muted-foreground mb-1 uppercase tracking-wide">
        フィールド ↔ DB カラム
      </div>
      <ul className="flex flex-col gap-1.5">
        {fields.map((field) => (
          <FieldColumnRow
            key={field.id}
            groupId={groupId}
            field={field}
            table={table}
            onColumnChange={onColumnChange}
          />
        ))}
      </ul>
    </div>
  )
}

interface FieldColumnRowProps {
  groupId: string
  field: SchemaField
  table: ScalarDbCatalogTable
  onColumnChange: (fieldId: string, columnName: string) => void
}

function FieldColumnRow({ groupId, field, table, onColumnChange }: FieldColumnRowProps) {
  const current = field.dbColumnName ?? ''
  const columnExists = current === '' || table.columns.some((c) => c.name === current)
  const selectId = `dbconn-col-${groupId}-${field.id}`
  const displayLabel = field.label || field.key

  return (
    <li className="grid grid-cols-[1fr_1fr] gap-2 items-center">
      <label htmlFor={selectId} className="text-[11px] truncate">
        {displayLabel}
        <span className="ml-1 text-[9px] text-muted-foreground">DB カラム</span>
      </label>
      <select
        id={selectId}
        value={current}
        onChange={(e) => onColumnChange(field.id, e.target.value)}
        className="text-xs border border-border rounded px-2 py-1 bg-background"
      >
        <option value="">(未選択)</option>
        {table.columns.map((c) => (
          <option key={c.name} value={c.name}>
            {c.name}
            {c.keyType ? ` [${c.keyType}]` : ''}
          </option>
        ))}
        {/* Synthetic disabled option preserves a stale dbColumnName */}
        {!columnExists && (
          <option value={current} disabled>
            {current} (列が存在しません)
          </option>
        )}
      </select>
    </li>
  )
}
