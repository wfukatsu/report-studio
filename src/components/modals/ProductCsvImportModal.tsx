import { useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store'
import { importProductsCsv } from '@/api/reportApi'

interface Props {
  onClose: () => void
}

interface ImportResult {
  imported: number
  skipped: number
  errors: RowError[]
}

interface RowError {
  row: number
  column: string
  value: string
  reason: string
  reasonCode?: string
}

/**
 * Server `reasonCode` → serverErrors translation key (#412). Unknown codes fall
 * back to the raw ja `reason` the server always sends.
 */
const CSV_REASON_KEY = {
  CODE_DUPLICATE: 'csvImport.CODE_DUPLICATE',
  CODE_INVALID_CHARS: 'csvImport.CODE_INVALID_CHARS',
  CODE_REQUIRED: 'csvImport.CODE_REQUIRED',
  PRICE_INVALID: 'csvImport.PRICE_INVALID',
  RESERVED_KEY: 'csvImport.RESERVED_KEY',
} as const

export function ProductCsvImportModal({ onClose }: Props) {
  const { t } = useTranslation('modals')
  const { t: tErr } = useTranslation('serverErrors')

  const reasonText = (e: RowError): string => {
    const key = e.reasonCode ? CSV_REASON_KEY[e.reasonCode as keyof typeof CSV_REASON_KEY] : undefined
    return key ? tErr(key, { code: e.value }) : e.reason
  }
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
      setError(e instanceof Error ? e.message : t('productCsvImportModal.importFailed'))
    } finally {
      setIsImporting(false)
    }
  }

  return (
    // #395: renders inline within ProductMasterTab (was a stacked full-screen
    // modal on top of the product-master modal). Kept as a self-contained panel.
    <div
      className="border border-border rounded-lg bg-muted/20 flex flex-col max-h-[70vh]"
      role="region"
      aria-label={t('productCsvImportModal.dialogLabel')}
      onKeyDown={(e) => { if (e.key === 'Escape' && !isImporting) onClose() }}
    >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h3 className="text-sm font-semibold">{t('productCsvImportModal.title')}</h3>
          <button onClick={onClose} disabled={isImporting} aria-label={t('productCsvImportModal.close')}
            className="text-muted-foreground hover:text-foreground text-xs px-2 py-1 rounded hover:bg-accent">✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {t('productCsvImportModal.autoDetectHeader')}<br />
            {t('productCsvImportModal.supportedColumns')}<code className="bg-muted px-1 rounded">code</code>{t('productCsvImportModal.codeRequired')}
            <code className="bg-muted px-1 rounded">name</code>{t('productCsvImportModal.columnSeparator')}
            <code className="bg-muted px-1 rounded">unitPrice</code>{t('productCsvImportModal.columnSeparator')}
            <code className="bg-muted px-1 rounded">category</code>{t('productCsvImportModal.columnSeparator')}
            <code className="bg-muted px-1 rounded">taxType</code>{t('productCsvImportModal.columnSeparator')}
            <code className="bg-muted px-1 rounded">unit</code>{t('productCsvImportModal.columnSeparator')}
            <code className="bg-muted px-1 rounded">manufacturer</code>
            {t('productCsvImportModal.otherColumns')}
          </p>

          {/* File upload */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 text-xs border rounded hover:bg-accent transition-colors"
            >
              {t('productCsvImportModal.selectFile')}
            </button>
            <span className="text-xs text-muted-foreground">{t('productCsvImportModal.orPaste')}</span>
            <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleFileChange} />
          </div>

          {/* CSV textarea */}
          <textarea
            value={csvText}
            onChange={(e) => { setCsvText(e.target.value); setResult(null); setError(null) }}
            placeholder={t('productCsvImportModal.csvPlaceholder')}
            rows={8}
            className="w-full border rounded px-2 py-1.5 text-xs bg-background font-mono resize-none"
          />

          {/* Result */}
          {result && (
            <div className="border rounded p-3 space-y-2">
              <div className="flex items-center gap-4 text-xs">
                <span className="text-green-600 font-medium">{t('productCsvImportModal.imported', { n: result.imported })}</span>
                {result.skipped > 0 && <span className="text-amber-600">{t('productCsvImportModal.skipped', { n: result.skipped })}</span>}
              </div>
              {result.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto">
                  <p className="text-xs font-medium text-muted-foreground mb-1">{t('productCsvImportModal.errorDetails')}</p>
                  {result.errors.map((e, i) => (
                    <div key={i} className="text-[10px] text-red-500">
                      {t('productCsvImportModal.errorRow', { row: e.row, column: e.column, reason: reasonText(e) })}{e.value ? ` (${e.value})` : ''}
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
            {result ? t('productCsvImportModal.close') : t('productCsvImportModal.cancel')}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!csvText.trim() || isImporting}
              className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-60 transition-opacity"
            >
              {isImporting ? t('productCsvImportModal.importing') : t('productCsvImportModal.runImport')}
            </button>
          )}
        </div>
    </div>
  )
}
