/**
 * ResponsesPanel — lists submitted form responses for the current template.
 *
 * Design:
 * - Only functional when backendConnected && currentTemplateId is set.
 * - 5-minute TTL cache via Zustand responsesSlice (invalidated on submit/delete)
 * - CSV/Excel export buttons with multi-click prevention (isExporting flag)
 * - Each response row: submittedAt, submittedBy, summary, PDF + delete actions
 * - XSS: all dynamic values rendered via textContent (no innerHTML)
 */

import { useEffect, useRef, useCallback, useState } from 'react'
import {
  RefreshCw, Download, FileText, Trash2, AlertCircle, Loader2, Send
} from 'lucide-react'
import { useReportStore } from '@/store'
import {
  listResponses, deleteResponse, exportResponses, getResponsePdf,
  submitBatchPdfJob, getBatchPdfStatus, downloadBatchPdfResult,
} from '@/api/reportApi'
import { downloadBlob } from '@/api/client'
import { CACHE_TTL_MS } from '@/store/responsesSlice'
import type { FormResponseSummary } from '@/lib/schemas/formResponse'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

function formatDate(epochMs: number): string {
  if (!epochMs) return '—'
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).format(new Date(epochMs))
  } catch {
    return String(epochMs)
  }
}

export function ResponsesPanel() {
  const backendConnected = useReportStore((s) => s.backendConnected)
  const currentTemplateId = useReportStore((s) => s.currentTemplateId)
  const responses = useReportStore((s) => s.responses)
  const responsesTotal = useReportStore((s) => s.responsesTotal)
  const responsesLoading = useReportStore((s) => s.responsesLoading)
  const responsesCacheTime = useReportStore((s) => s.responsesCacheTime)
  const setResponses = useReportStore((s) => s.setResponses)
  const setResponsesLoading = useReportStore((s) => s.setResponsesLoading)
  const invalidateResponsesCache = useReportStore((s) => s.invalidateResponsesCache)
  const openSubmitResponseModal = useReportStore((s) => s.openSubmitResponseModal)

  const [loadError, setLoadError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<FormResponseSummary | null>(null)
  const [batchState, setBatchState] = useState<'idle' | 'submitting' | 'polling'>('idle')
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null)
  const cancelBatchRef = useRef<{ canceled: boolean } | null>(null)

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleBatchPdf = async () => {
    if (batchState !== 'idle' || selectedIds.size === 0 || !currentTemplateId) return
    setBatchState('submitting')
    const cancelToken = { canceled: false }
    cancelBatchRef.current = cancelToken
    try {
      const { batchJobId, totalCount } = await submitBatchPdfJob(currentTemplateId, [...selectedIds])
      setBatchProgress({ completed: 0, total: totalCount })
      setBatchState('polling')
      while (true) {
        if (cancelToken.canceled) break
        await new Promise(r => setTimeout(r, 2000))
        if (cancelToken.canceled) break
        const status = await getBatchPdfStatus(batchJobId)
        setBatchProgress({ completed: status.completed, total: status.total })
        if (status.status === 'completed') {
          try {
            const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
            await downloadBatchPdfResult(batchJobId, `batch_${date}.zip`)
          } catch { /* download failed — user can retry */ }
          break
        }
        if (status.status === 'failed') break
      }
    } catch { /* ignore */ }
    finally {
      setBatchState('idle')
      setBatchProgress(null)
      setSelectedIds(new Set())
    }
  }

  useEffect(() => () => { if (cancelBatchRef.current) cancelBatchRef.current.canceled = true }, [])
  const [downloadingPdfId, setDownloadingPdfId] = useState<string | null>(null)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  const fetchResponses = useCallback(async (force = false) => {
    if (!currentTemplateId || !backendConnected) return
    const now = Date.now()
    if (!force && now - responsesCacheTime < CACHE_TTL_MS && responses.length > 0) return

    setResponsesLoading(true)
    setLoadError(null)
    try {
      const result = await listResponses(currentTemplateId)
      if (!mountedRef.current) return
      setResponses(result.items, result.total)
    } catch (err) {
      if (!mountedRef.current) return
      setLoadError(err instanceof Error ? err.message : 'Failed to load responses')
    } finally {
      if (mountedRef.current) setResponsesLoading(false)
    }
  }, [currentTemplateId, backendConnected, responsesCacheTime, responses.length,
      setResponsesLoading, setResponses])

  // Auto-fetch on mount and when templateId changes
  useEffect(() => {
    fetchResponses()
  }, [fetchResponses])

  const execDelete = useCallback(async (response: FormResponseSummary) => {
    if (!currentTemplateId) return
    setDeletingId(response.id)
    try {
      await deleteResponse(currentTemplateId, response.id)
      invalidateResponsesCache()
      await fetchResponses(true)
    } catch (err) {
      alert(err instanceof Error ? err.message : '削除に失敗しました')
    } finally {
      if (mountedRef.current) setDeletingId(null)
    }
  }, [currentTemplateId, invalidateResponsesCache, fetchResponses])

  const handleDelete = useCallback((response: FormResponseSummary) => {
    setDeleteTarget(response)
  }, [])

  const handleExport = useCallback(async (format: 'csv' | 'excel') => {
    if (!currentTemplateId || isExporting) return
    setIsExporting(true)
    try {
      await exportResponses(currentTemplateId, format)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'エクスポートに失敗しました')
    } finally {
      if (mountedRef.current) setIsExporting(false)
    }
  }, [currentTemplateId, isExporting])

  const handleDownloadPdf = useCallback(async (response: FormResponseSummary) => {
    if (!currentTemplateId) return
    setDownloadingPdfId(response.id)
    try {
      const blob = await getResponsePdf(currentTemplateId, response.id)
      downloadBlob(blob, `response-${response.id}.pdf`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'PDF生成に失敗しました')
    } finally {
      if (mountedRef.current) setDownloadingPdfId(null)
    }
  }, [currentTemplateId])

  if (!backendConnected || !currentTemplateId) {
    return (
      <div className="p-4 space-y-3">
        {!backendConnected && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-medium">バックエンドに接続されていません</p>
            <p>以下のコマンドでバックエンドを起動してください:</p>
            <code className="block bg-amber-100 rounded px-2 py-1 font-mono">npm run dev:full</code>
          </div>
        )}
        {backendConnected && !currentTemplateId && (
          <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium">テンプレートが未選択です</p>
            <p className="mt-0.5">デザインタブでテンプレートを開くか作成してください。</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-200 shrink-0">
        <span className="text-sm font-medium text-gray-700">
          回答一覧 ({responsesTotal})
        </span>
        <div className="flex gap-1">
          <button
            aria-label="回答を送信"
            title="回答を送信"
            onClick={openSubmitResponseModal}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          >
            <Send className="w-4 h-4" />
          </button>
          <button
            aria-label="再読み込み"
            title="再読み込み"
            onClick={() => fetchResponses(true)}
            disabled={responsesLoading}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${responsesLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Batch PDF bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-primary/5 shrink-0">
          <span className="text-xs text-muted-foreground flex-1">{selectedIds.size}件選択中</span>
          {batchState === 'polling' && batchProgress && (
            <span className="text-xs text-muted-foreground">
              {batchProgress.completed}/{batchProgress.total} 完了
            </span>
          )}
          <button
            onClick={handleBatchPdf}
            disabled={batchState !== 'idle'}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60"
          >
            {batchState !== 'idle' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            一括PDF
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* Export buttons */}
      <div className="flex gap-2 p-3 border-b border-gray-100 shrink-0">
        <button
          onClick={() => handleExport('csv')}
          disabled={isExporting || responses.length === 0}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300
                     hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3 h-3" />
          CSV
        </button>
        <button
          onClick={() => handleExport('excel')}
          disabled={isExporting || responses.length === 0}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded border border-gray-300
                     hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Download className="w-3 h-3" />
          Excel
        </button>
        {isExporting && <Loader2 className="w-4 h-4 animate-spin text-gray-400 self-center" />}
      </div>

      {/* Error */}
      {loadError && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-600 bg-red-50" role="alert">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {loadError}
        </div>
      )}

      {/* Loading */}
      {responsesLoading && responses.length === 0 && (
        <div className="flex justify-center p-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty state */}
      {!responsesLoading && !loadError && responses.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-500">
          回答がまだありません。
        </div>
      )}

      {/* Response list */}
      <ul
        role="list"
        aria-label="フォーム回答一覧"
        className="flex-1 overflow-y-auto divide-y divide-gray-100"
      >
        {responses.map((resp) => (
          <li key={resp.id} className="p-3 hover:bg-gray-50">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                aria-label={`${resp.submittedBy} を選択`}
                checked={selectedIds.has(resp.id)}
                onChange={() => toggleSelect(resp.id)}
                className="mt-1 shrink-0"
              />
            <div className="flex items-start justify-between gap-2 flex-1">
              <div className="flex-1 min-w-0">
                <div className="text-xs text-gray-500 mb-0.5">
                  {formatDate(resp.submittedAt)} — {resp.submittedBy}
                </div>
                {resp.summary.length > 0 && (
                  <ul className="text-xs text-gray-700 space-y-0.5">
                    {resp.summary.map((s, i) => (
                      <li key={i} className="truncate">{s}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  aria-label="PDF回答票をダウンロード"
                  title="PDF回答票"
                  onClick={() => handleDownloadPdf(resp)}
                  disabled={downloadingPdfId === resp.id}
                  className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-40"
                >
                  {downloadingPdfId === resp.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <FileText className="w-3.5 h-3.5" />
                  }
                </button>
                <button
                  aria-label="削除"
                  title="削除"
                  onClick={() => handleDelete(resp)}
                  disabled={deletingId === resp.id}
                  className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 disabled:opacity-40"
                >
                  {deletingId === resp.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2 className="w-3.5 h-3.5" />
                  }
                </button>
              </div>
            </div>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="回答を削除"
        message={`回答 ${deleteTarget?.id.slice(0, 8)}... を削除しますか？この操作は元に戻せません。`}
        confirmLabel="削除"
        confirmVariant="danger"
        onConfirm={() => { if (deleteTarget) { void execDelete(deleteTarget) } setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
