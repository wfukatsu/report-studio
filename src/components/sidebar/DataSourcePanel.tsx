import { useState, useEffect, useRef } from 'react'
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
      setDataSource({ id: uuidv4(), name: 'フォームデータ', fields })
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
        データソース
      </p>

      {dataSource && (
        <div className="rounded-lg border border-border bg-card p-2 text-xs">
          <p className="font-medium">{dataSource.name}</p>
          <p className="text-muted-foreground mt-0.5">
            {Object.keys(dataSource.fields as object).length} 件のトップレベルフィールド
          </p>
          <button
            onClick={handleClear}
            className="mt-2 text-destructive hover:underline"
          >
            クリア
          </button>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex gap-1 text-xs border-b pb-2">
          <button
            onClick={switchToForm}
            className={cn('px-2 py-1 rounded', inputMode === 'form' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >フォーム</button>
          <button
            onClick={switchToJson}
            className={cn('px-2 py-1 rounded', inputMode === 'json' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent')}
          >JSON</button>
        </div>

        {inputMode === 'form' && (
          <div className="space-y-1">
            <div className="grid grid-cols-[1fr_1fr_20px] gap-1 text-xs text-muted-foreground mb-1">
              <span>フィールド名</span>
              <span>サンプル値</span>
              <span />
            </div>
            {formRows.map((row, i) => (
              <div key={row.id} className="grid grid-cols-[1fr_1fr_20px] gap-1 items-center">
                <input
                  className="border rounded px-1.5 py-1 text-xs bg-background"
                  placeholder="例: customer.name"
                  value={row.key}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setFormRows(rows => rows.map((r, j) => j === i ? { ...r, key: newValue } : r))
                  }}
                />
                <input
                  className="border rounded px-1.5 py-1 text-xs bg-background"
                  placeholder="例: 山田太郎"
                  value={row.value}
                  onChange={(e) => {
                    const newValue = e.target.value
                    setFormRows(rows => rows.map((r, j) => j === i ? { ...r, value: newValue } : r))
                  }}
                />
                <button
                  onClick={() => setFormRows(rows => rows.filter((_, j) => j !== i))}
                  className="p-0.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  aria-label="この行を削除"
                  title="行を削除"
                  disabled={formRows.length === 1}
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() => setFormRows(rows => [...rows, { id: uuidv4(), key: '', value: '' }])}
              className="text-xs text-primary hover:underline"
            >+ フィールドを追加</button>
            <button
              onClick={handleFormApply}
              className="w-full py-1.5 rounded bg-primary text-primary-foreground text-xs hover:bg-primary/90 disabled:opacity-40"
              disabled={!formRows.some(r => r.key.trim())}
            >データを適用</button>
          </div>
        )}

        {inputMode === 'json' && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">JSONデータを貼り付け:</p>
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
              データを適用
            </button>
          </div>
        )}
      </div>

      <div className="rounded-lg border border-border bg-muted/50 p-2 text-xs space-y-1">
        <p className="font-medium text-muted-foreground">システム変数</p>
        <p className="text-muted-foreground">
          テキスト要素で以下の変数が使用できます:
        </p>
        <ul className="space-y-0.5 text-muted-foreground font-mono">
          <li><code className="bg-muted px-1 rounded">{'{{$page}}'}</code> — 現在のページ番号</li>
          <li><code className="bg-muted px-1 rounded">{'{{$totalPages}}'}</code> — 総ページ数</li>
          <li><code className="bg-muted px-1 rounded">{'{{$printDate}}'}</code> — 印刷日</li>
        </ul>
      </div>
    </div>
  )
}
