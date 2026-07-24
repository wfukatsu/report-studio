/**
 * BulkExportModal — DB-row-driven bulk PDF export (#193).
 *
 * Given a set of data rows (from a ScalarDB table or the product master), the user
 * picks a bound template and an optional output filename template, and the rows are
 * rendered into a batch-PDF ZIP job. Progress is polled and the ZIP auto-downloads;
 * the job also appears in the ジョブ (job history) tab.
 */
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  listReports, submitBatchPdfJobFromRows, getBatchPdfStatus, downloadBatchPdfResult,
  type TemplateListItem,
} from '@/api/reportApi'
import { useModalA11y } from '@/hooks/useModalA11y'

interface Props {
  open: boolean
  rows: Record<string, unknown>[]
  onClose: () => void
}

const MAX_BATCH = 50

export function BulkExportModal({ open, rows, onClose }: Props) {
  const { t } = useTranslation('components')
  const [templates, setTemplates] = useState<TemplateListItem[]>([])
  const [templateId, setTemplateId] = useState('')
  const [filenameTemplate, setFilenameTemplate] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'polling'>('idle')
  const [progress, setProgress] = useState<{ completed: number; total: number } | null>(null)
  const cancelRef = useRef<{ canceled: boolean } | null>(null)

  useEffect(() => {
    if (!open) return
    listReports()
      .then((r) => setTemplates(r.items))
      .catch(() => setTemplates([]))
  }, [open])

  useEffect(() => () => { if (cancelRef.current) cancelRef.current.canceled = true }, [])

  // #428: focus trap + Esc + opener focus restore
  const { dialogRef } = useModalA11y({ open, onClose })

  if (!open) return null

  const tooMany = rows.length > MAX_BATCH
  const canRun = templateId !== '' && rows.length > 0 && !tooMany && state === 'idle'

  const handleRun = async () => {
    if (!canRun) return
    setState('submitting')
    const cancelToken = { canceled: false }
    cancelRef.current = cancelToken
    try {
      const { batchJobId, totalCount } = await submitBatchPdfJobFromRows(
        templateId, rows, filenameTemplate ? { filenameTemplate } : {},
      )
      setProgress({ completed: 0, total: totalCount })
      setState('polling')
      while (!cancelToken.canceled) {
        await new Promise((r) => setTimeout(r, 2000))
        if (cancelToken.canceled) break
        const status = await getBatchPdfStatus(batchJobId)
        setProgress({ completed: status.completed, total: status.total })
        if (status.status === 'completed') {
          const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
          try { await downloadBatchPdfResult(batchJobId, `bulk_${date}.zip`) } catch { /* retry from ジョブ tab */ }
          toast.success(t('dataBrowser.bulkExportModal.bulkPdfDone', { n: status.completed }))
          break
        }
        if (status.status === 'failed') {
          toast.error(t('dataBrowser.bulkExportModal.bulkPdfFailed'), { description: status.error })
          break
        }
      }
    } catch {
      toast.error(t('dataBrowser.bulkExportModal.submitFailed'))
    } finally {
      setState('idle')
      setProgress(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        ref={dialogRef}
        className="bg-background rounded-lg shadow-xl w-full max-w-md p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t('dataBrowser.bulkExportModal.title')}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">{t('dataBrowser.bulkExportModal.title')}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label={t('dataBrowser.bulkExportModal.close')}>
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          {t('dataBrowser.bulkExportModal.targetRows')} <span className="font-medium text-foreground">{rows.length}</span> {t('dataBrowser.bulkExportModal.rowsUnit')}
          {tooMany && <span className="text-red-500"> {t('dataBrowser.bulkExportModal.tooMany', { max: MAX_BATCH })}</span>}
        </p>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">{t('dataBrowser.bulkExportModal.template')}</span>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded border bg-background"
          >
            <option value="">{t('dataBrowser.bulkExportModal.selectPlaceholder')}</option>
            {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            {t('dataBrowser.bulkExportModal.filenameLabel')}
          </span>
          <input
            type="text"
            value={filenameTemplate}
            onChange={(e) => setFilenameTemplate(e.target.value)}
            placeholder="{documentNo}_{customerName}.pdf"
            className="w-full text-sm px-2 py-1.5 rounded border bg-background font-mono"
          />
          <span className="text-[10px] text-muted-foreground">
            {t('dataBrowser.bulkExportModal.filenameHint', { seq: '{seq}', date: '{date}', documentNo: '{documentNo}', status: '{status}', name: '{name}' })}
          </span>
        </label>

        {state === 'polling' && progress && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {t('dataBrowser.bulkExportModal.progress', { completed: progress.completed, total: progress.total })}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={state !== 'idle'}
            className="text-xs px-3 py-1.5 rounded border hover:bg-muted disabled:opacity-40"
          >
            {t('dataBrowser.bulkExportModal.close')}
          </button>
          <button
            onClick={handleRun}
            disabled={!canRun}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
          >
            {state !== 'idle' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            {t('dataBrowser.bulkExportModal.run')}
          </button>
        </div>
      </div>
    </div>
  )
}
