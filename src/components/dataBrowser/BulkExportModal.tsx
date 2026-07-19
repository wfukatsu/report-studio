/**
 * BulkExportModal — DB-row-driven bulk PDF export (#193).
 *
 * Given a set of data rows (from a ScalarDB table or the product master), the user
 * picks a bound template and an optional output filename template, and the rows are
 * rendered into a batch-PDF ZIP job. Progress is polled and the ZIP auto-downloads;
 * the job also appears in the ジョブ (job history) tab.
 */
import { useEffect, useRef, useState } from 'react'
import { Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  listReports, submitBatchPdfJobFromRows, getBatchPdfStatus, downloadBatchPdfResult,
  type TemplateListItem,
} from '@/api/reportApi'

interface Props {
  open: boolean
  rows: Record<string, unknown>[]
  onClose: () => void
}

const MAX_BATCH = 50

export function BulkExportModal({ open, rows, onClose }: Props) {
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
          toast.success(`一括PDFを出力しました（${status.completed}件）`)
          break
        }
        if (status.status === 'failed') {
          toast.error('一括PDF出力に失敗しました', { description: status.error })
          break
        }
      }
    } catch {
      toast.error('一括PDFジョブの送信に失敗しました')
    } finally {
      setState('idle')
      setProgress(null)
      onClose()
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-background rounded-lg shadow-xl w-full max-w-md p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="一括PDF出力"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">一括PDF出力</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-muted text-muted-foreground" aria-label="閉じる">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground">
          対象行: <span className="font-medium text-foreground">{rows.length}</span> 件
          {tooMany && <span className="text-red-500"> （一度に出力できるのは最大{MAX_BATCH}件です）</span>}
        </p>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">テンプレート</span>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full text-sm px-2 py-1.5 rounded border bg-background"
          >
            <option value="">選択してください</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>

        <label className="block space-y-1">
          <span className="text-xs text-muted-foreground">
            ファイル名テンプレート（任意）
          </span>
          <input
            type="text"
            value={filenameTemplate}
            onChange={(e) => setFilenameTemplate(e.target.value)}
            placeholder="{documentNo}_{customerName}.pdf"
            className="w-full text-sm px-2 py-1.5 rounded border bg-background font-mono"
          />
          <span className="text-[10px] text-muted-foreground">
            使用可能: {'{seq}'} {'{date}'} {'{documentNo}'} {'{status}'} と各データ列（例 {'{name}'}）
          </span>
        </label>

        {state === 'polling' && progress && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            {progress.completed}/{progress.total} 完了
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onClose}
            disabled={state !== 'idle'}
            className="text-xs px-3 py-1.5 rounded border hover:bg-muted disabled:opacity-40"
          >
            閉じる
          </button>
          <button
            onClick={handleRun}
            disabled={!canRun}
            className="text-xs px-3 py-1.5 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-40 flex items-center gap-1.5"
          >
            {state !== 'idle' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            出力する
          </button>
        </div>
      </div>
    </div>
  )
}
