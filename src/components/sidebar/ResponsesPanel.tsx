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

import { useEffect, useRef, useCallback, useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ParseKeys } from 'i18next'
import {
  RefreshCw, Download, FileText, Trash2, Loader2, Send
} from 'lucide-react'
import { toast } from 'sonner'
import { useReportStore } from '@/store'
import {
  listResponses, deleteResponse, exportResponses, getResponsePdf,
  submitBatchPdfJob, getBatchPdfStatus, downloadBatchPdfResult,
  updateResponseStatus,
} from '@/api/reportApi'
import { downloadBlob } from '@/api/client'
import { CACHE_TTL_MS } from '@/store/responsesSlice'
import type { FormResponseSummary, ReportStatus } from '@/lib/schemas/formResponse'
import { REPORT_STATUSES } from '@/lib/schemas/formResponse'

// Document status display (#163). Cycle order matches REPORT_STATUSES.
// i18n key per status (namespace `components`); resolved via t() at each call site.
const STATUS_LABEL_KEY: Record<ReportStatus, ParseKeys<'components'>> = {
  draft: 'sidebar.responsesPanel.status.draft',
  issued: 'sidebar.responsesPanel.status.issued',
  sent: 'sidebar.responsesPanel.status.sent',
  void: 'sidebar.responsesPanel.status.void',
}
const STATUS_BADGE: Record<ReportStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  issued: 'bg-blue-50 text-blue-600',
  sent: 'bg-green-50 text-green-600',
  void: 'bg-red-50 text-red-500 line-through',
}
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { InlineErrorBanner } from '@/components/common/InlineErrorBanner'
import { classifyError, type UserFacingError } from '@/lib/userFacingError'
import { getErrorCopy } from '@/lib/userFacingErrorMessages'
import { formatSummaryLines } from '@/lib/summaryFormat'

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
  const { t } = useTranslation('components')
  const { t: tErr } = useTranslation('serverErrors')
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

  const [loadError, setLoadError] = useState<UserFacingError | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [deleteTarget, setDeleteTarget] = useState<FormResponseSummary | null>(null)
  const [batchState, setBatchState] = useState<'idle' | 'submitting' | 'polling'>('idle')
  const [batchProgress, setBatchProgress] = useState<{ completed: number; total: number } | null>(null)
  const cancelBatchRef = useRef<{ canceled: boolean } | null>(null)
  // Status filter (#172) and bulk-status busy flag (#173). null = すべて.
  const [statusFilter, setStatusFilter] = useState<ReportStatus | null>(null)
  const [bulkStatusBusy, setBulkStatusBusy] = useState(false)

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const r of responses) {
      const s = r.status ?? 'issued'
      counts[s] = (counts[s] ?? 0) + 1
    }
    return counts
  }, [responses])

  const visibleResponses = useMemo(
    () => (statusFilter ? responses.filter((r) => (r.status ?? 'issued') === statusFilter) : responses),
    [responses, statusFilter],
  )

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
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
    // Cache is valid whenever a fetch has completed within the TTL —
    // including an EMPTY result (cacheTime === 0 means "never fetched" /
    // explicitly invalidated). Requiring responses.length > 0 here caused an
    // infinite refetch loop for templates with zero responses: every fetch
    // restamped cacheTime, recreating this callback and re-firing the
    // fetch-on-mount effect.
    if (!force && responsesCacheTime > 0 && now - responsesCacheTime < CACHE_TTL_MS) return

    setResponsesLoading(true)
    setLoadError(null)
    try {
      const result = await listResponses(currentTemplateId)
      if (!mountedRef.current) return
      setResponses(result.items, result.total)
    } catch (err) {
      if (!mountedRef.current) return
      setLoadError(classifyError(err))
    } finally {
      if (mountedRef.current) setResponsesLoading(false)
    }
  }, [currentTemplateId, backendConnected, responsesCacheTime,
      setResponsesLoading, setResponses])

  // Auto-fetch on mount and when templateId changes. Inlined (not via
  // fetchResponses) so all local state updates happen in promise callbacks —
  // the effect body performs no synchronous React setState. Cache semantics
  // mirror fetchResponses(force = false).
  useEffect(() => {
    if (!currentTemplateId || !backendConnected) return
    if (responsesCacheTime > 0 && Date.now() - responsesCacheTime < CACHE_TTL_MS) return

    setResponsesLoading(true)
    listResponses(currentTemplateId)
      .then((result) => {
        if (!mountedRef.current) return
        setResponses(result.items, result.total)
        setLoadError(null)
      })
      .catch((err) => {
        if (mountedRef.current) setLoadError(classifyError(err))
      })
      .finally(() => {
        if (mountedRef.current) setResponsesLoading(false)
      })
  }, [currentTemplateId, backendConnected, responsesCacheTime,
      setResponsesLoading, setResponses])

  const execDelete = useCallback(async (response: FormResponseSummary) => {
    if (!currentTemplateId) return
    setDeletingId(response.id)
    try {
      await deleteResponse(currentTemplateId, response.id)
      invalidateResponsesCache()
      await fetchResponses(true)
    } catch (err) {
      const copy = getErrorCopy(classifyError(err).code, tErr)
      toast.error(t('sidebar.responsesPanel.toast.deleteFailed'), { description: copy.hint, duration: 6000 })
    } finally {
      if (mountedRef.current) setDeletingId(null)
    }
  }, [currentTemplateId, invalidateResponsesCache, fetchResponses, t, tErr])

  const handleDelete = useCallback((response: FormResponseSummary) => {
    setDeleteTarget(response)
  }, [])

  // Cycle the document status (下書き→発行済→送付済→無効→…) with an optimistic
  // update; refetch on failure to resync (#163).
  const handleCycleStatus = useCallback(async (response: FormResponseSummary) => {
    if (!currentTemplateId) return
    const current = (response.status ?? 'issued') as ReportStatus
    const idx = REPORT_STATUSES.indexOf(current)
    const next = REPORT_STATUSES[(idx + 1) % REPORT_STATUSES.length]
    const prev = useReportStore.getState().responses
    setResponses(prev.map((r) => (r.id === response.id ? { ...r, status: next } : r)), responsesTotal)
    try {
      await updateResponseStatus(currentTemplateId, response.id, next)
    } catch {
      toast.error(t('sidebar.responsesPanel.toast.statusUpdateFailed'), { duration: 6000 })
      void fetchResponses(true)
    }
  }, [currentTemplateId, responsesTotal, setResponses, fetchResponses, t])

  // Bulk status change over the selected responses (#173). Loops the tested single
  // PATCH endpoint; refetches at the end to resync (and pick up any partial failure).
  const handleBulkStatus = useCallback(async (next: ReportStatus) => {
    if (!currentTemplateId || selectedIds.size === 0 || bulkStatusBusy) return
    setBulkStatusBusy(true)
    let failed = 0
    for (const id of selectedIds) {
      try { await updateResponseStatus(currentTemplateId, id, next) } catch { failed++ }
    }
    setBulkStatusBusy(false)
    setSelectedIds(new Set())
    invalidateResponsesCache()
    await fetchResponses(true)
    if (failed > 0) toast.error(t('sidebar.responsesPanel.toast.bulkStatusFailed', { n: failed }), { duration: 6000 })
    else toast.success(t('sidebar.responsesPanel.toast.bulkStatusChanged', { n: selectedIds.size, status: t(STATUS_LABEL_KEY[next]) }))
  }, [currentTemplateId, selectedIds, bulkStatusBusy, invalidateResponsesCache, fetchResponses, t])

  const handleExport = useCallback(async (format: 'csv' | 'excel') => {
    if (!currentTemplateId || isExporting) return
    setIsExporting(true)
    try {
      await exportResponses(currentTemplateId, format)
    } catch (err) {
      const copy = getErrorCopy(classifyError(err).code, tErr)
      toast.error(t('sidebar.responsesPanel.toast.exportFailed'), { description: copy.hint, duration: 6000 })
    } finally {
      if (mountedRef.current) setIsExporting(false)
    }
  }, [currentTemplateId, isExporting, t, tErr])

  const handleDownloadPdf = useCallback(async (response: FormResponseSummary) => {
    if (!currentTemplateId) return
    setDownloadingPdfId(response.id)
    try {
      const blob = await getResponsePdf(currentTemplateId, response.id)
      downloadBlob(blob, `response-${response.id}.pdf`)
    } catch (err) {
      const copy = getErrorCopy(classifyError(err).code, tErr)
      toast.error(t('sidebar.responsesPanel.toast.pdfFailed'), { description: copy.hint, duration: 6000 })
    } finally {
      if (mountedRef.current) setDownloadingPdfId(null)
    }
  }, [currentTemplateId, t, tErr])

  if (!backendConnected || !currentTemplateId) {
    return (
      <div className="p-4 space-y-3">
        {!backendConnected && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
            <p className="font-medium">{t('sidebar.responsesPanel.notConnected.title')}</p>
            <p>{t('sidebar.responsesPanel.notConnected.body')}</p>
            {import.meta.env.DEV && (
              <details className="mt-1 opacity-90">
                <summary className="cursor-pointer text-[10px]">{t('sidebar.responsesPanel.notConnected.devSummary')}</summary>
                <p className="mt-1">{t('sidebar.responsesPanel.notConnected.devHint')}</p>
                <code className="block bg-amber-100 rounded px-2 py-1 font-mono">npm run dev:full</code>
              </details>
            )}
          </div>
        )}
        {backendConnected && !currentTemplateId && (
          <div className="rounded-md border border-muted bg-muted/30 p-3 text-xs text-muted-foreground">
            <p className="font-medium">{t('sidebar.responsesPanel.noTemplate.title')}</p>
            <p className="mt-0.5">{t('sidebar.responsesPanel.noTemplate.body')}</p>
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
          {t('sidebar.responsesPanel.header.title', { n: responsesTotal })}
        </span>
        <div className="flex gap-1">
          <button
            aria-label={t('sidebar.responsesPanel.actions.submit')}
            title={t('sidebar.responsesPanel.actions.submit')}
            onClick={openSubmitResponseModal}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
          >
            <Send className="w-4 h-4" />
          </button>
          <button
            aria-label={t('sidebar.responsesPanel.actions.reload')}
            title={t('sidebar.responsesPanel.actions.reload')}
            onClick={() => fetchResponses(true)}
            disabled={responsesLoading}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${responsesLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status filter chips (#172) */}
      {responses.length > 0 && (
        <div className="flex items-center gap-1 px-3 py-1.5 border-b border-gray-100 shrink-0 flex-wrap">
          <button
            onClick={() => setStatusFilter(null)}
            className={`text-[10px] px-1.5 py-0.5 rounded border ${statusFilter === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent border-border'}`}
          >
            {t('sidebar.responsesPanel.filter.all', { n: responses.length })}
          </button>
          {REPORT_STATUSES.filter((s) => (statusCounts[s] ?? 0) > 0).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(statusFilter === s ? null : s)}
              className={`text-[10px] px-1.5 py-0.5 rounded border ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent border-border'}`}
            >
              {t(STATUS_LABEL_KEY[s])} {statusCounts[s]}
            </button>
          ))}
        </div>
      )}

      {/* Batch action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-primary/5 shrink-0 flex-wrap">
          <span className="text-xs text-muted-foreground">{t('sidebar.responsesPanel.batch.selectedCount', { n: selectedIds.size })}</span>
          {batchState === 'polling' && batchProgress && (
            <span className="text-xs text-muted-foreground">
              {t('sidebar.responsesPanel.batch.progress', { completed: batchProgress.completed, total: batchProgress.total })}
            </span>
          )}
          {/* Bulk status change (#173) */}
          <select
            aria-label={t('sidebar.responsesPanel.batch.bulkStatusAria')}
            value=""
            disabled={bulkStatusBusy}
            onChange={(e) => { const v = e.target.value as ReportStatus; if (v) void handleBulkStatus(v) }}
            className="text-xs px-1.5 py-1 rounded border bg-background disabled:opacity-60"
          >
            <option value="">{t('sidebar.responsesPanel.batch.bulkStatusPlaceholder')}</option>
            {REPORT_STATUSES.map((s) => <option key={s} value={s}>{t('sidebar.responsesPanel.batch.setStatusOption', { status: t(STATUS_LABEL_KEY[s]) })}</option>)}
          </select>
          <button
            onClick={handleBatchPdf}
            disabled={batchState !== 'idle'}
            className="flex items-center gap-1 text-xs px-2 py-1 rounded bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-60 ml-auto"
          >
            {batchState !== 'idle' ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
            {t('sidebar.responsesPanel.batch.batchPdf')}
          </button>
          <button onClick={() => setSelectedIds(new Set())} className="text-xs text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* Select-all — selects the currently visible (filtered) responses (#164/#172) */}
      {visibleResponses.length > 0 && (
        <label className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-100 text-xs text-gray-600 cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={visibleResponses.every((r) => selectedIds.has(r.id))}
            ref={(el) => { if (el) el.indeterminate = selectedIds.size > 0 && !visibleResponses.every((r) => selectedIds.has(r.id)) }}
            onChange={(e) => setSelectedIds(e.target.checked ? new Set(visibleResponses.map((r) => r.id)) : new Set())}
          />
          {statusFilter
            ? t('sidebar.responsesPanel.selectAll.labelFiltered', { status: t(STATUS_LABEL_KEY[statusFilter]) })
            : t('sidebar.responsesPanel.selectAll.label')}
        </label>
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
        <div className="p-3">
          <InlineErrorBanner
            error={loadError}
            tone="destructive"
            onRetry={() => fetchResponses(true)}
          />
        </div>
      )}

      {/* Loading */}
      {responsesLoading && responses.length === 0 && (
        <div className="flex justify-center p-8">
          <Loader2 className="w-5 h-5 animate-spin text-gray-400" />
        </div>
      )}

      {/* Empty state — explain how to create responses so the batch-PDF feature
          (which only appears once responses exist) is discoverable (#167). */}
      {!responsesLoading && !loadError && responses.length === 0 && (
        <div className="p-6 text-center text-sm text-gray-500 flex flex-col items-center gap-3">
          <p>{t('sidebar.responsesPanel.empty.title')}</p>
          <p className="text-xs text-gray-400 leading-relaxed">
            {t('sidebar.responsesPanel.empty.hintLine1')}
            <br />
            {t('sidebar.responsesPanel.empty.hintLine2')}
          </p>
          <button
            onClick={openSubmitResponseModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            {t('sidebar.responsesPanel.actions.submit')}
          </button>
        </div>
      )}

      {/* Response list */}
      <ul
        role="list"
        aria-label={t('sidebar.responsesPanel.list.ariaLabel')}
        className="flex-1 overflow-y-auto divide-y divide-gray-100"
      >
        {visibleResponses.map((resp) => (
          <li key={resp.id} className="p-3 hover:bg-gray-50">
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                aria-label={t('sidebar.responsesPanel.row.selectAria', { name: resp.submittedBy })}
                checked={selectedIds.has(resp.id)}
                onChange={() => toggleSelect(resp.id)}
                className="mt-1 shrink-0"
              />
            <div className="flex items-start justify-between gap-2 flex-1">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <button
                    onClick={() => handleCycleStatus(resp)}
                    className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${STATUS_BADGE[(resp.status ?? 'issued') as ReportStatus]}`}
                    title={t('sidebar.responsesPanel.row.statusCycleTitle')}
                  >
                    {t(STATUS_LABEL_KEY[(resp.status ?? 'issued') as ReportStatus])}
                  </button>
                  <span className="text-xs text-gray-500 truncate">
                    {formatDate(resp.submittedAt)} — {resp.submittedBy}
                  </span>
                </div>
                {resp.summary.length > 0 && (
                  <ul className="text-xs text-gray-700 space-y-0.5">
                    {formatSummaryLines(resp.summary, resp.summaryItems, tErr).map((s, i) => (
                      <li key={i} className="truncate">{s}</li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="flex gap-1 shrink-0">
                <button
                  aria-label={t('sidebar.responsesPanel.row.pdfAria')}
                  title={t('sidebar.responsesPanel.row.pdfTitle')}
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
                  aria-label={t('sidebar.responsesPanel.row.delete')}
                  title={t('sidebar.responsesPanel.row.delete')}
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
        title={t('sidebar.responsesPanel.confirm.title')}
        message={t('sidebar.responsesPanel.confirm.message', { id: deleteTarget?.id.slice(0, 8) })}
        confirmLabel={t('sidebar.responsesPanel.confirm.confirmLabel')}
        confirmVariant="danger"
        onConfirm={() => { if (deleteTarget) { void execDelete(deleteTarget) } setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
