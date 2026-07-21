import { Search, Download } from 'lucide-react'
import { useTranslation } from 'react-i18next'

interface Props {
  searchQuery: string
  onSearchChange: (q: string) => void
  onExportCsv: () => void
  totalRows: number
  truncated?: boolean
}

export function DataGridToolbar({ searchQuery, onSearchChange, onExportCsv, totalRows, truncated }: Props) {
  const { t } = useTranslation('components')
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b shrink-0">
      <div className="relative flex-1 max-w-xs">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t('dataBrowser.dataGridToolbar.searchPlaceholder')}
          aria-label={t('dataBrowser.dataGridToolbar.searchLabel')}
          className="border rounded pl-7 pr-2 py-1 text-xs bg-background w-full"
        />
      </div>

      <div className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
        {truncated && (
          <span className="flex items-center gap-1 text-amber-600 mr-2">
            <span>⚠</span>
            <span>{t('dataBrowser.dataGridToolbar.truncatedNotice')}</span>
          </span>
        )}
        <span>{totalRows.toLocaleString('ja-JP')} {t('dataBrowser.dataGridToolbar.rowsUnit')}</span>
      </div>

      <button
        onClick={onExportCsv}
        title={t('dataBrowser.dataGridToolbar.csvTitle')}
        aria-label={t('dataBrowser.dataGridToolbar.csvLabel')}
        className="flex items-center gap-1 px-2 py-1 text-xs border rounded hover:bg-accent transition-colors shrink-0"
      >
        <Download className="w-3.5 h-3.5" />
        CSV
      </button>
    </div>
  )
}
