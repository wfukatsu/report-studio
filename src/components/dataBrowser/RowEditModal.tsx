import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ScalarDbColumnMeta, ScalarDbRowValues } from '@/api/reportApi'
import { insertScalarDbRow, updateScalarDbRow } from '@/api/reportApi'

interface Props {
  open: boolean
  mode: 'create' | 'edit'
  namespace: string
  table: string
  columns: ScalarDbColumnMeta[]
  row?: ScalarDbRowValues
  onSave: () => void
  onClose: () => void
}

export function RowEditModal({ open, ...rest }: Props) {
  // Mount the content only while open: the form state initializes from props
  // at mount and dies on close — no props→state sync effect needed.
  if (!open) return null
  return <RowEditModalContent {...rest} />
}

function RowEditModalContent({ mode, namespace, table, columns, row, onSave, onClose }: Omit<Props, 'open'>) {
  const { t } = useTranslation('components')
  const [form, setForm] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const col of columns) {
      const existing = row?.[col.name]
      initial[col.name] = existing != null ? String(existing) : ''
    }
    return initial
  })
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const keyColumns = new Set(columns.filter((c) => c.keyType === 'partition' || c.keyType === 'clustering').map((c) => c.name))

  function parseValue(col: ScalarDbColumnMeta, raw: string): string | number | boolean | null {
    if (raw === '') return null
    switch (col.type) {
      case 'INT': case 'BIGINT': return parseInt(raw, 10)
      case 'FLOAT': case 'DOUBLE': return parseFloat(raw)
      case 'BOOLEAN': return raw === 'true'
      default: return raw
    }
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const values: ScalarDbRowValues = {}
      for (const col of columns) {
        const parsed = parseValue(col, form[col.name] ?? '')
        if (parsed !== null || keyColumns.has(col.name)) {
          values[col.name] = parsed
        }
      }
      // Validate keys are present
      for (const k of keyColumns) {
        if (values[k] == null || values[k] === '') {
          setError(t('dataBrowser.rowEditModal.keyRequired', { col: k }))
          setSaving(false)
          return
        }
      }

      if (mode === 'create') {
        await insertScalarDbRow(namespace, table, values)
      } else {
        await updateScalarDbRow(namespace, table, values)
      }
      onSave()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('dataBrowser.rowEditModal.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-background border rounded-lg shadow-xl w-[560px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-sm font-semibold">
            {mode === 'create' ? t('dataBrowser.rowEditModal.addRow') : t('dataBrowser.rowEditModal.editRow')} — {namespace}.{table}
          </h2>
          <button onClick={onClose} disabled={saving} className="text-muted-foreground hover:text-foreground">
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
          {error && (
            <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">
              {error}
            </div>
          )}
          {columns.map((col) => {
            const isKey = keyColumns.has(col.name)
            const isReadonly = mode === 'edit' && isKey
            return (
              <label key={col.name} className="flex flex-col gap-1">
                <span className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  {col.name}
                  <span className="text-[9px] text-muted-foreground/60">{col.type}</span>
                  {isKey && <span className="text-[9px] text-blue-600 bg-blue-50 px-1 rounded">{col.keyType}</span>}
                </span>
                {col.type === 'BOOLEAN' ? (
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form[col.name] === 'true'}
                      disabled={isReadonly}
                      onChange={(e) => setForm((p) => ({ ...p, [col.name]: String(e.target.checked) }))}
                      className="rounded"
                    />
                    <span className="text-xs">{form[col.name] === 'true' ? 'true' : 'false'}</span>
                  </label>
                ) : (
                  <input
                    type={['INT', 'BIGINT', 'FLOAT', 'DOUBLE'].includes(col.type) ? 'number' : 'text'}
                    step={['FLOAT', 'DOUBLE'].includes(col.type) ? 'any' : undefined}
                    value={form[col.name] ?? ''}
                    readOnly={isReadonly}
                    onChange={(e) => setForm((p) => ({ ...p, [col.name]: e.target.value }))}
                    className={`border rounded px-2 py-1 text-xs w-full bg-background ${isReadonly ? 'bg-muted text-muted-foreground cursor-not-allowed' : ''}`}
                  />
                )}
              </label>
            )
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <button onClick={onClose} disabled={saving} className="px-3 py-1.5 text-xs border rounded hover:bg-accent">
            {t('dataBrowser.rowEditModal.cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50"
          >
            {saving ? t('dataBrowser.rowEditModal.saving') : mode === 'create' ? t('dataBrowser.rowEditModal.add') : t('dataBrowser.rowEditModal.save')}
          </button>
        </div>
      </div>
    </div>
  )
}
