import { Search, Download } from 'lucide-react'
import { downloadBlob } from '@/api/client'

interface Props {
  searchQuery: string
  onSearchChange: (q: string) => void
  onExportCsv: () => void
  totalRows: number
  truncated?: boolean
}

export function DataGridToolbar({ searchQuery, onSearchChange, onExportCsv, totalRows, truncated }: Props) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="現在のページを検索..."
          aria-label="データを検索"
          className="border rounded pl-7 pr-2 py-1 text-xs bg-background w-full"
        />
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
        {truncated && (
          <span className="flex items-center gap-1 text-amber-600 mr-2">
            <span>⚠</span>
            <span>上位 10,000 件のみ表示</span>
          </span>
        )}
        <span>{totalRows.toLocaleString('ja-JP')} 件</span>
      </div>

      <button
        onClick={onExportCsv}
        title="現在のページをCSVでダウンロード"
        aria-label="CSVエクスポート"
        className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent transition-colors shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        CSV
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// CSV export utility
// ---------------------------------------------------------------------------

export function exportToCsv(
  columns: string[],
  rows: Record<string, unknown>[],
  filename: string,
) {
  const escape = (v: unknown): string => {
    const s = v == null ? '' : String(v)
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const header = columns.map(escape).join(',')
  const body = rows.map((row) => columns.map((col) => escape(row[col])).join(',')).join('\n')
  const csv = header + '\n' + body
  downloadBlob(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), filename)
}
