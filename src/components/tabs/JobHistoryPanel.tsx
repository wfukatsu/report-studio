/**
 * JobHistoryPanel — unified job-history browser (#192).
 *
 * Lists every batch/PDF job (V1 CSV batch, V2 single-PDF, V2 batch-ZIP) via the
 * unified /api/v2/pdf-jobs endpoint (#191): progress, result re-download, failure
 * detail, and cancel. Auto-refreshes while any job is still running.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, Loader2, Download, X, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useReportStore } from '@/store'
import { listJobs, cancelJob, downloadBatchPdfResult, type JobSummary } from '@/api/reportApi'

const STATUS_BADGE: Record<JobSummary['status'], string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-amber-50 text-amber-600',
  completed: 'bg-green-50 text-green-600',
  failed: 'bg-red-50 text-red-600',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
}

function formatDate(epochMs: number): string {
  if (!epochMs) return '—'
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).format(new Date(epochMs))
  } catch {
    return String(epochMs)
  }
}

export function JobHistoryPanel() {
  const { t } = useTranslation('components')
  const STATUS_LABEL: Record<JobSummary['status'], string> = {
    pending: t('tabs.jobHistoryPanel.statusPending'),
    processing: t('tabs.jobHistoryPanel.statusProcessing'),
    completed: t('tabs.jobHistoryPanel.statusCompleted'),
    failed: t('tabs.jobHistoryPanel.statusFailed'),
    cancelled: t('tabs.jobHistoryPanel.statusCancelled'),
  }
  const TYPE_LABEL: Record<string, string> = {
    V1_BATCH: t('tabs.jobHistoryPanel.typeV1Batch'),
    V2_PDF: t('tabs.jobHistoryPanel.typeV2Pdf'),
    V2_BATCH: t('tabs.jobHistoryPanel.typeV2Batch'),
  }
  const backendConnected = useReportStore((s) => s.backendConnected)
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchJobs = useCallback(async () => {
    if (!backendConnected) return
    setLoading(true)
    setError(null)
    try {
      setJobs(await listJobs())
    } catch {
      setError(t('tabs.jobHistoryPanel.fetchError'))
    } finally {
      setLoading(false)
    }
  }, [backendConnected, t])

  // Initial fetch, deferred to a task: fetchJobs flips the loading flag
  // synchronously (wanted for user-triggered refreshes), so the effect
  // schedules it instead of calling it inline — no sync setState in the
  // effect body, and the cleanup cancels a pending schedule.
  useEffect(() => {
    const id = setTimeout(() => { void fetchJobs() }, 0)
    return () => clearTimeout(id)
  }, [fetchJobs])

  // Auto-refresh every 3s while any job is still running.
  useEffect(() => {
    const anyRunning = jobs.some((j) => j.status === 'pending' || j.status === 'processing')
    if (!anyRunning) return
    timerRef.current = setTimeout(() => { void fetchJobs() }, 3000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [jobs, fetchJobs])

  const handleCancel = useCallback(async (job: JobSummary) => {
    setBusyId(job.jobId)
    try {
      await cancelJob(job.jobId)
      await fetchJobs()
    } catch {
      toast.error(t('tabs.jobHistoryPanel.cancelError'), { duration: 6000 })
    } finally {
      setBusyId(null)
    }
  }, [fetchJobs, t])

  const handleDownload = useCallback(async (job: JobSummary) => {
    // Only batch-ZIP jobs expose a re-downloadable artifact through the batch result
    // endpoint. (Single-PDF and CSV jobs consume their result on first download.)
    if (job.jobType !== 'V2_BATCH') {
      toast.info(t('tabs.jobHistoryPanel.downloadUnsupported'), { duration: 5000 })
      return
    }
    setBusyId(job.jobId)
    try {
      await downloadBatchPdfResult(job.jobId, `${job.jobId}.zip`)
      await fetchJobs()
    } catch {
      toast.error(t('tabs.jobHistoryPanel.downloadError'), { duration: 6000 })
    } finally {
      setBusyId(null)
    }
  }, [fetchJobs, t])

  if (!backendConnected) {
    return (
      <div className="p-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {t('tabs.jobHistoryPanel.notConnected')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <span className="text-sm font-medium text-gray-700">{t('tabs.jobHistoryPanel.headerTitle', { n: jobs.length })}</span>
        <button
          aria-label={t('tabs.jobHistoryPanel.reload')}
          title={t('tabs.jobHistoryPanel.reload')}
          onClick={() => void fetchJobs()}
          disabled={loading}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {error && (
        <div className="p-3">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => void fetchJobs()} className="underline">{t('tabs.jobHistoryPanel.retry')}</button>
          </div>
        </div>
      )}

      {loading && jobs.length === 0 && (
        <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-500">
          {t('tabs.jobHistoryPanel.emptyMessage')}
        </div>
      )}

      {jobs.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/40 text-gray-600">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">{t('tabs.jobHistoryPanel.colStatus')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.jobHistoryPanel.colType')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.jobHistoryPanel.colProgress')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.jobHistoryPanel.colCreated')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.jobHistoryPanel.colUpdated')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('tabs.jobHistoryPanel.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {jobs.map((job) => {
                const running = job.status === 'pending' || job.status === 'processing'
                return (
                  <tr key={job.jobId} className="hover:bg-gray-50 align-top">
                    <td className="px-3 py-2">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[job.status]}`}>
                        {STATUS_LABEL[job.status]}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-600">{TYPE_LABEL[job.jobType] ?? job.jobType}</td>
                    <td className="px-3 py-2 text-gray-600">
                      <div className="flex items-center gap-1.5">
                        <span>{job.completed}/{job.total}{job.failed > 0 ? t('tabs.jobHistoryPanel.failedSuffix', { n: job.failed }) : ''}</span>
                        {job.error && (
                          <span className="inline-flex items-center gap-0.5 text-red-500" title={job.error}>
                            <AlertCircle className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                      {job.error && <div className="text-[10px] text-red-500 mt-0.5 max-w-[16rem] truncate">{job.error}</div>}
                    </td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(job.createdAt)}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(job.updatedAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        {job.status === 'completed' && job.jobType === 'V2_BATCH' && (
                          <button
                            aria-label={t('tabs.jobHistoryPanel.downloadResult')}
                            title={t('tabs.jobHistoryPanel.downloadResultZip')}
                            onClick={() => void handleDownload(job)}
                            disabled={busyId === job.jobId}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-40"
                          >
                            {busyId === job.jobId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          aria-label={running ? t('tabs.jobHistoryPanel.cancel') : t('tabs.jobHistoryPanel.delete')}
                          title={running ? t('tabs.jobHistoryPanel.cancel') : t('tabs.jobHistoryPanel.deleteFromHistory')}
                          onClick={() => void handleCancel(job)}
                          disabled={busyId === job.jobId}
                          className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 disabled:opacity-40"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
