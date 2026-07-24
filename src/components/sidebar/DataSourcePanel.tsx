import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import { useReportStore } from '@/store/reportStore'
import { v4 as uuidv4 } from 'uuid'
import { parseDataSourceJSON } from '@/lib/dataSourceUtils'
import { cn } from '@/lib/utils'

type FieldRow = { id: string; key: string; value: string }

function rowsFromDataSource(ds: { fields: unknown } | null): FieldRow[] {
  if (!ds || typeof ds.fields !== 'object' || ds.fields === null) {
    return [{ id: uuidv4(), key: '', value: '' }]
  }
  const entries = Object.entries(ds.fields as Record<string, unknown>)
  if (entries.length === 0) return [{ id: uuidv4(), key: '', value: '' }]
  return entries.map(([key, value]) => ({
    id: uuidv4(),
    key,
    value: typeof value === 'string' ? value : JSON.stringify(value),
  }))
}

export function DataSourcePanel() {
  const { t } = useTranslation('components')
  const dataSource = useReportStore((s) => s.definition.dataSources[0] ?? null)
  const setDataSource = useReportStore((s) => s.setDataSource)
  const [jsonText, setJsonText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [inputMode, setInputMode] = useState<'form' | 'json'>('form')
  const [formRows, setFormRows] = useState<FieldRow[]>(() => rowsFromDataSource(dataSource))
  const prevDataSourceIdRef = useRef<string | null>(dataSource?.id ?? null)

  // Sync store dataSource → formRows when the source changes externally
  useEffect(() => {
    if (dataSource?.id !== prevDataSourceIdRef.current) {
      prevDataSourceIdRef.current = dataSource?.id ?? null
      setFormRows(rowsFromDataSource(dataSource))
    }
  }, [dataSource])

  const handleApply = () => {
    const result = parseDataSourceJSON(jsonText)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setDataSource({ id: uuidv4(), name: 'Custom Data', fields: result.fields })
    setError(null)
  }

  const handleFormApply = () => {
    const fields: Record<string, unknown> = {}
    formRows.filter(r => r.key.trim()).forEach(r => {
      fields[r.key.trim()] = r.value
    })
    if (Object.keys(fields).length > 0) {
      setDataSource({ id: uuidv4(), name: t('sidebar.dataSourcePanel.formDataSourceName'), fields })
      setError(null)
    }
  }

  const handleClear = () => {
    prevDataSourceIdRef.current = null
    setDataSource(null)
    setJsonText('')
    setFormRows([{ id: uuidv4(), key: '', value: '' }])
    setError(null)
  }

  const switchToJson = () => {
    // Sync form rows to JSON text
    const fields: Record<string, string> = {}
    formRows.filter(r => r.key.trim()).forEach(r => {
      fields[r.key.trim()] = r.value
    })
    if (Object.keys(fields).length > 0) {
      setJsonText(JSON.stringify(fields, null, 2))
    }
    setInputMode('json')
  }

  const switchToForm = () => {
    // Sync JSON text to form rows
    if (jsonText.trim()) {
      try {
        const parsed = JSON.parse(jsonText)
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
          const rows: FieldRow[] = Object.entries(parsed).map(([key, value]) => ({
            id: uuidv4(),
            key,
            value: typeof value === 'string' ? value : JSON.stringify(value),
          }))
          if (rows.length > 0) {
            setFormRows(rows)
          }
        }
      } catch {
        // JSON is invalid, keep current form rows
      }
    }
    setInputMode('form')
  }

  return (
    <div className="p-3 space-y-3">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        {t('sidebar.dataSourcePanel.title')}
      </p>

      {dataSource && (
        <div className="rounded-lg border border-border bg-card p-2 text-xs">
          <p className="font-medium">{dataSource.name}</p>
          <p className="text-muted-foreground mt-0.5">
            {t('sidebar.dataSourcePanel.topLevelFields', { n: Object.keys(dataSource.fields as object).length })}
          </p>
          <button
            onClick={handleClear}
            className="mt-2 text-destructive hover:underline"
          >
            {t('sidebar.dataSourcePanel.clear')}
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-1 text-xs border-b pb-2">
          <button
            onClick={switchToForm}
            className={cn('px-2 py-1 rounded', inputMode === 'form' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >{t('sidebar.dataSourcePanel.tab.form')}</button>
          <button
            onClick={switchToJson}
            className={cn('px-2 py-1 rounded', inputMode === 'json' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >JSON</button>
        </div>

        {inputMode === 'form' && (
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_1fr_20px] gap-1 text-xs text-muted-foreground mb-1">
              <span>{t('sidebar.dataSourcePanel.form.fieldName')}</span>
              <span>{t('sidebar.dataSourcePanel.form.sampleValue')}</span>
              <span />
            </div>
            {formRows.map((row, i) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_20px] gap-1 items-center">
                <input
                  className="border rounded px-1.5 py-1 text-xs bg-background"
                  placeholder={t('sidebar.dataSourcePanel.form.keyPlaceholder')}
                  value={row.key}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setFormRows(rows => rows.map((r, j) => j === i ? { ...r, key: newValue } : r))
                  }}
                />
                <input
                  className="border rounded px-1.5 py-1 text-xs bg-background"
                  placeholder={t('sidebar.dataSourcePanel.form.valuePlaceholder')}
                  value={row.value}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setFormRows(rows => rows.map((r, j) => j === i ? { ...r, value: newValue } : r))
                  }}
                />
                <button
                  onClick={() => setFormRows(rows => rows.filter((_, j) => j !== i))}
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  aria-label={t('sidebar.dataSourcePanel.form.removeRowAria')}
                  title={t('sidebar.dataSourcePanel.form.removeRowTitle')}
                  disabled={formRows.length === 1}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setFormRows(rows => [...rows, { id: uuidv4(), key: '', value: '' }])}
              className="text-xs text-primary hover:underline"
            >{t('sidebar.dataSourcePanel.form.addField')}</button>
            <button
              onClick={handleFormApply}
              className="w-full py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-40"
              disabled={!formRows.some(r => r.key.trim())}
            >{t('sidebar.dataSourcePanel.form.apply')}</button>
          </div>
        )}

        {inputMode === 'json' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{t('sidebar.dataSourcePanel.json.pasteLabel')}</p>
            <textarea
              className="w-full border rounded px-2 py-1.5 text-xs bg-background font-mono resize-y min-h-[180px]"
              rows={10}
              placeholder={'{\n  "customer": {\n    "name": "Alice"\n  }\n}'}
              value={jsonText}
              onChange={(e) => setJsonText(e.target.value)}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <button
              onClick={handleApply}
              disabled={!jsonText.trim()}
              className="w-full py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {t('sidebar.dataSourcePanel.form.apply')}
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-2 text-xs space-y-1">
        <p className="font-medium text-muted-foreground">{t('sidebar.dataSourcePanel.sysVars.title')}</p>
        <p className="text-muted-foreground">
          {t('sidebar.dataSourcePanel.sysVars.desc')}
        </p>
        <ul className="space-y-0.5 text-muted-foreground font-mono">
          <li><code className="bg-muted px-1 rounded">{'{{$page}}'}</code> — {t('sidebar.dataSourcePanel.sysVars.currentPage')}</li>
          <li><code className="bg-muted px-1 rounded">{'{{$totalPages}}'}</code> — {t('sidebar.dataSourcePanel.sysVars.totalPages')}</li>
          <li><code className="bg-muted px-1 rounded">{'{{$printDate}}'}</code> — {t('sidebar.dataSourcePanel.sysVars.printDate')}</li>
        </ul>
      </div>
    </div>
  )
}
