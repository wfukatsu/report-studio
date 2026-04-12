import { useRef, useState } from 'react'
import { useReportStore } from '@/store'
import { importProductsCsv } from '@/api/reportApi'

interface Props {
  onClose: () => void
}

interface ImportResult {
  imported: number
  skipped: number
  errors: { row: number; column: string; value: string; reason: string }[]
}

export function ProductCsvImportModal({ onClose }: Props) {
  const fetchProducts = useReportStore((s) => s.fetchProducts)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvText, setCsvText] = useState('')
  const [isImporting, setIsImporting] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      setCsvText((ev.target?.result as string) ?? '')
      setResult(null)
      setError(null)
    }
    reader.readAsText(file, 'UTF-8')
    e.target.value = ''
  }

  const handleImport = async () => {
    if (!csvText.trim() || isImporting) return
    setIsImporting(true)
    setError(null)
    setResult(null)
    try {
      const res = await importProductsCsv(csvText)
      setResult(res)
      if (res.imported > 0) fetchProducts()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'インポートに失敗しました')
    } finally {
      setIsImporting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40"
      role="dialog"
      aria-modal="true"
      aria-label="CSVインポート"
      onKeyDown={(e) => { if (e.key === 'Escape' && !isImporting) onClose() }}
    >
      <div className="bg-background border border-border rounded-lg shadow-xl w-[560px] max-h-[85vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="text-sm font-semibold">商品マスター CSVインポート</h3>
          <button onClick={onClose} disabled={isImporting} aria-label="閉じる"
            className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            CSVの先頭行を列名として自動認識します。<br />
            対応列: <code className="bg-muted px-1 rounded">code</code>（必須）・
            <code className="bg-muted px-1 rounded">name</code>・
            <code className="bg-muted px-1 rounded">unitPrice</code>・
            <code className="bg-muted px-1 rounded">category</code>・
            <code className="bg-muted px-1 rounded">taxType</code>・
            <code className="bg-muted px-1 rounded">unit</code>・
            <code className="bg-muted px-1 rounded">manufacturer</code>・
            その他列はカスタムフィールドに自動追加。
          </p>

          {/* File upload */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs border rounded hover:bg-accent transition-colors"
            >
              ファイルを選択
            </button>
            <span className="text-xs text-muted-foreground">またはCSVを貼り付け</span>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>

          {/* CSV textarea */}
          <textarea
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setResult(null); setError(null) }}
            placeholder={'code,name,unitPrice\nP001,商品A,1000\nP002,商品B,2000'}
            rows={8}
            className="w-full border rounded px-2 py-1.5 text-xs bg-background font-mono resize-none"
          />

          {/* Result */}
          {result && (
            <div className="border rounded p-3 space-y-2">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-green-600 font-medium">✓ 登録: {result.imported}件</span>
                {result.skipped > 0 && <span className="text-amber-600">スキップ: {result.skipped}件</span>}
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground mb-1">エラー詳細:</p>
                  {result.errors.map((e, i) => (
                    <div key={i} className="text-[10px] text-red-500">
                      行{e.row} / {e.column}: {e.reason}{e.value ? ` (${e.value})` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t shrink-0">
          <button onClick={onClose} disabled={isImporting}
            className="px-3 py-1.5 text-xs border rounded hover:bg-accent disabled:opacity-60 transition-colors">
            {result ? '閉じる' : 'キャンセル'}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!csvText.trim() || isImporting}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {isImporting ? 'インポート中...' : 'インポート実行'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
