/**
 * JobHistoryPanel — unified job-history browser (#192).
 *
 * Lists every batch/PDF job (V1 CSV batch, V2 single-PDF, V2 batch-ZIP) via the
 * unified /api/v2/pdf-jobs endpoint (#191): progress, result re-download, failure
 * detail, and cancel. Auto-refreshes while any job is still running.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { RefreshCw, Loader2, Download, X, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'
import { useReportStore } from '@/store'
import { listJobs, cancelJob, downloadBatchPdfResult, type JobSummary } from '@/api/reportApi'

const STATUS_LABEL: Record<JobSummary['status'], string> = {
  pending: '待機中', processing: '処理中', completed: '完了', failed: '失敗', cancelled: 'キャンセル',
}
const STATUS_BADGE: Record<JobSummary['status'], string> = {
  pending: 'bg-gray-100 text-gray-600',
  processing: 'bg-amber-50 text-amber-600',
  completed: 'bg-green-50 text-green-600',
  failed: 'bg-red-50 text-red-600',
  cancelled: 'bg-gray-100 text-gray-400 line-through',
}
const TYPE_LABEL: Record<string, string> = {
  V1_BATCH: 'CSV一括', V2_PDF: '単票PDF', V2_BATCH: '一括PDF',
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
      setError('ジョブ一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }, [backendConnected])

  useEffect(() => { void fetchJobs() }, [fetchJobs])

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
      toast.error('ジョブの操作に失敗しました', { duration: 6000 })
    } finally {
      setBusyId(null)
    }
  }, [fetchJobs])

  const handleDownload = useCallback(async (job: JobSummary) => {
    // Only batch-ZIP jobs expose a re-downloadable artifact through the batch result
    // endpoint. (Single-PDF and CSV jobs consume their result on first download.)
    if (job.jobType !== 'V2_BATCH') {
      toast.info('この種別のジョブは履歴からの再ダウンロードに対応していません', { duration: 5000 })
      return
    }
    setBusyId(job.jobId)
    try {
      await downloadBatchPdfResult(job.jobId, `${job.jobId}.zip`)
      await fetchJobs()
    } catch {
      toast.error('ダウンロードに失敗しました（結果が期限切れの可能性があります）', { duration: 6000 })
    } finally {
      setBusyId(null)
    }
  }, [fetchJobs])

  if (!backendConnected) {
    return (
      <div className="p-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          バックエンドに接続できません。しばらく待ってから再試行してください。
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto">
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <span className="text-sm font-medium text-gray-700">ジョブ履歴 ({jobs.length})</span>
        <button
          aria-label="再読み込み"
          title="再読み込み"
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
            <button onClick={() => void fetchJobs()} className="underline">再試行</button>
          </div>
        </div>
      )}

      {loading && jobs.length === 0 && (
        <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      )}

      {!loading && !error && jobs.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-500">
          ジョブがまだありません。一括PDF出力などを実行すると、ここに履歴が表示されます。
        </div>
      )}

      {jobs.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/40 text-gray-600">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">状態</th>
                <th className="px-3 py-2 font-medium">種別</th>
                <th className="px-3 py-2 font-medium">進捗</th>
                <th className="px-3 py-2 font-medium">作成</th>
                <th className="px-3 py-2 font-medium">更新</th>
                <th className="px-3 py-2 font-medium text-right">操作</th>
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
                        <span>{job.completed}/{job.total}{job.failed > 0 ? `（失敗${job.failed}）` : ''}</span>
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
                            aria-label="結果をダウンロード"
                            title="結果ZIPをダウンロード"
                            onClick={() => void handleDownload(job)}
                            disabled={busyId === job.jobId}
                            className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-40"
                          >
                            {busyId === job.jobId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                          </button>
                        )}
                        <button
                          aria-label={running ? 'キャンセル' : '削除'}
                          title={running ? 'キャンセル' : '履歴から削除'}
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
