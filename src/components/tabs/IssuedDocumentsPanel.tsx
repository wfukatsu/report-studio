/**
 * IssuedDocumentsPanel — cross-template "issued documents" view (#190).
 *
 * Unlike the Responses tab (scoped to the open template), this lists issued
 * documents across every template the user can access, with status/template
 * filtering, status change, document-number display, PDF re-download, void, and
 * the status-transition audit history (#188).
 */
import { Fragment, useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RefreshCw, FileText, Loader2, History, Ban } from 'lucide-react'
import { toast } from 'sonner'
import { useReportStore } from '@/store'
import {
  listDocuments, getResponsePdf, updateResponseStatus, getResponseAudit,
  type IssuedDocument, type AuditEntry,
} from '@/api/reportApi'
import { downloadBlob } from '@/api/client'
import type { ReportStatus } from '@/lib/schemas/formResponse'
import { REPORT_STATUSES } from '@/lib/schemas/formResponse'
import { formatSummaryLines } from '@/lib/summaryFormat'

const STATUS_BADGE: Record<ReportStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  issued: 'bg-blue-50 text-blue-600',
  sent: 'bg-green-50 text-green-600',
  void: 'bg-red-50 text-red-500 line-through',
}

function formatDate(epochMs: number): string {
  if (!epochMs) return '—'
  try {
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    }).format(new Date(epochMs))
  } catch {
    return String(epochMs)
  }
}

export function IssuedDocumentsPanel() {
  const { t } = useTranslation('components')
  const { t: tErr } = useTranslation('serverErrors')
  const STATUS_LABEL: Record<ReportStatus, string> = {
    draft: t('tabs.issuedDocumentsPanel.statusDraft'),
    issued: t('tabs.issuedDocumentsPanel.statusIssued'),
    sent: t('tabs.issuedDocumentsPanel.statusSent'),
    void: t('tabs.issuedDocumentsPanel.statusVoid'),
  }
  const backendConnected = useReportStore((s) => s.backendConnected)
  const [docs, setDocs] = useState<IssuedDocument[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<ReportStatus | null>(null)
  const [templateFilter, setTemplateFilter] = useState<string>('')
  const [busyId, setBusyId] = useState<string | null>(null)
  const [auditOpen, setAuditOpen] = useState<string | null>(null)
  const [auditCache, setAuditCache] = useState<Record<string, AuditEntry[]>>({})

  const fetchDocs = useCallback(async () => {
    if (!backendConnected) return
    setLoading(true)
    setError(null)
    try {
      const result = await listDocuments({ status: statusFilter ?? undefined })
      setDocs(result.items)
    } catch {
      setError(t('tabs.issuedDocumentsPanel.fetchError'))
    } finally {
      setLoading(false)
    }
  }, [backendConnected, statusFilter, t])

  // Fetch on mount / filter change, deferred to a task: fetchDocs flips the
  // loading flag synchronously (wanted for user-triggered refreshes), so the
  // effect schedules it instead of calling it inline — no sync setState in
  // the effect body, and the cleanup cancels a pending schedule.
  useEffect(() => {
    const id = setTimeout(() => { void fetchDocs() }, 0)
    return () => clearTimeout(id)
  }, [fetchDocs])

  const templateNames = useMemo(() => {
    const m = new Map<string, string>()
    for (const d of docs) m.set(d.templateId, d.templateName)
    return [...m.entries()]
  }, [docs])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const d of docs) counts[d.status] = (counts[d.status] ?? 0) + 1
    return counts
  }, [docs])

  const visible = useMemo(
    () => (templateFilter ? docs.filter((d) => d.templateId === templateFilter) : docs),
    [docs, templateFilter],
  )

  const handleSetStatus = useCallback(async (doc: IssuedDocument, next: ReportStatus) => {
    setBusyId(doc.id)
    try {
      await updateResponseStatus(doc.templateId, doc.id, next)
      setDocs((prev) => prev.map((d) => (d.id === doc.id ? { ...d, status: next } : d)))
      setAuditCache((prev) => { const c = { ...prev }; delete c[doc.id]; return c })
    } catch {
      toast.error(t('tabs.issuedDocumentsPanel.updateStatusError'), { duration: 6000 })
    } finally {
      setBusyId(null)
    }
  }, [t])

  const handleDownloadPdf = useCallback(async (doc: IssuedDocument) => {
    setBusyId(doc.id)
    try {
      const blob = await getResponsePdf(doc.templateId, doc.id)
      downloadBlob(blob, `${doc.documentNumber || doc.id}.pdf`)
    } catch {
      toast.error(t('tabs.issuedDocumentsPanel.pdfError'), { duration: 6000 })
    } finally {
      setBusyId(null)
    }
  }, [t])

  const toggleAudit = useCallback(async (doc: IssuedDocument) => {
    if (auditOpen === doc.id) { setAuditOpen(null); return }
    setAuditOpen(doc.id)
    if (!auditCache[doc.id]) {
      try {
        const entries = await getResponseAudit(doc.templateId, doc.id)
        setAuditCache((prev) => ({ ...prev, [doc.id]: entries }))
      } catch {
        setAuditCache((prev) => ({ ...prev, [doc.id]: [] }))
      }
    }
  }, [auditOpen, auditCache])

  if (!backendConnected) {
    return (
      <div className="p-4">
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          {t('tabs.issuedDocumentsPanel.notConnected')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full w-full max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b shrink-0">
        <span className="text-sm font-medium text-gray-700">{t('tabs.issuedDocumentsPanel.headerTitle', { n: docs.length })}</span>
        <button
          aria-label={t('tabs.issuedDocumentsPanel.reload')}
          title={t('tabs.issuedDocumentsPanel.reload')}
          onClick={() => void fetchDocs()}
          disabled={loading}
          className="p-1.5 rounded hover:bg-gray-100 text-gray-600 disabled:opacity-40"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b shrink-0 flex-wrap">
        <button
          onClick={() => setStatusFilter(null)}
          className={`text-[11px] px-2 py-0.5 rounded border ${statusFilter === null ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent border-border'}`}
        >
          {t('tabs.issuedDocumentsPanel.filterAll')}
        </button>
        {REPORT_STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(statusFilter === s ? null : s)}
            className={`text-[11px] px-2 py-0.5 rounded border ${statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background hover:bg-accent border-border'}`}
          >
            {STATUS_LABEL[s]}{statusCounts[s] ? ` ${statusCounts[s]}` : ''}
          </button>
        ))}
        {templateNames.length > 1 && (
          <select
            aria-label={t('tabs.issuedDocumentsPanel.filterTemplateLabel')}
            value={templateFilter}
            onChange={(e) => setTemplateFilter(e.target.value)}
            className="ml-auto text-[11px] px-1.5 py-1 rounded border bg-background"
          >
            <option value="">{t('tabs.issuedDocumentsPanel.allTemplates')}</option>
            {templateNames.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="p-3">
          <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-700 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => void fetchDocs()} className="underline">{t('tabs.issuedDocumentsPanel.retry')}</button>
          </div>
        </div>
      )}

      {loading && docs.length === 0 && (
        <div className="flex justify-center p-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
      )}

      {!loading && !error && docs.length === 0 && (
        <div className="p-8 text-center text-sm text-gray-500">
          {t('tabs.issuedDocumentsPanel.emptyMessage')}
        </div>
      )}

      {/* Table */}
      {visible.length > 0 && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-muted/40 text-gray-600">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">{t('tabs.issuedDocumentsPanel.colStatus')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.issuedDocumentsPanel.colDocNumber')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.issuedDocumentsPanel.colTemplate')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.issuedDocumentsPanel.colContent')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.issuedDocumentsPanel.colIssuedAt')}</th>
                <th className="px-3 py-2 font-medium">{t('tabs.issuedDocumentsPanel.colIssuedBy')}</th>
                <th className="px-3 py-2 font-medium text-right">{t('tabs.issuedDocumentsPanel.colActions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map((doc) => (
                <Fragment key={doc.id}>
                  <tr className="hover:bg-gray-50">
                    <td className="px-3 py-2">
                      <select
                        aria-label={t('tabs.issuedDocumentsPanel.changeStatusLabel')}
                        value={doc.status}
                        disabled={busyId === doc.id}
                        onChange={(e) => void handleSetStatus(doc, e.target.value as ReportStatus)}
                        className={`text-[10px] px-1.5 py-0.5 rounded border-0 ${STATUS_BADGE[doc.status]}`}
                      >
                        {REPORT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-2 font-mono text-gray-700">{doc.documentNumber || '—'}</td>
                    <td className="px-3 py-2 text-gray-700 truncate max-w-[10rem]">{doc.templateName}</td>
                    <td className="px-3 py-2 text-gray-600 truncate max-w-[16rem]">{formatSummaryLines(doc.summary, doc.summaryItems, tErr).join(' / ')}</td>
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{formatDate(doc.submittedAt)}</td>
                    <td className="px-3 py-2 text-gray-500">{doc.submittedBy}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 justify-end">
                        <button
                          aria-label={t('tabs.issuedDocumentsPanel.auditLabel')}
                          title={t('tabs.issuedDocumentsPanel.auditTitle')}
                          onClick={() => void toggleAudit(doc)}
                          className="p-1 rounded hover:bg-gray-100 text-gray-500"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                        <button
                          aria-label={t('tabs.issuedDocumentsPanel.downloadPdfLabel')}
                          title={t('tabs.issuedDocumentsPanel.downloadPdfTitle')}
                          onClick={() => void handleDownloadPdf(doc)}
                          disabled={busyId === doc.id}
                          className="p-1 rounded hover:bg-gray-100 text-gray-500 disabled:opacity-40"
                        >
                          {busyId === doc.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileText className="w-3.5 h-3.5" />}
                        </button>
                        {doc.status !== 'void' && (
                          <button
                            aria-label={t('tabs.issuedDocumentsPanel.voidLabel')}
                            title={t('tabs.issuedDocumentsPanel.voidTitle')}
                            onClick={() => void handleSetStatus(doc, 'void')}
                            disabled={busyId === doc.id}
                            className="p-1 rounded hover:bg-red-50 text-gray-500 hover:text-red-600 disabled:opacity-40"
                          >
                            <Ban className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {auditOpen === doc.id && (
                    <tr className="bg-muted/20">
                      <td colSpan={7} className="px-6 py-2">
                        {!auditCache[doc.id] ? (
                          <span className="text-[11px] text-gray-400">{t('tabs.issuedDocumentsPanel.auditLoading')}</span>
                        ) : auditCache[doc.id].length === 0 ? (
                          <span className="text-[11px] text-gray-400">{t('tabs.issuedDocumentsPanel.auditEmpty')}</span>
                        ) : (
                          <ul className="text-[11px] text-gray-600 space-y-0.5">
                            {auditCache[doc.id].map((e) => (
                              <li key={e.id}>
                                {formatDate(e.at)} — {e.by}：
                                {e.from ? `${STATUS_LABEL[e.from as ReportStatus] ?? e.from} → ` : t('tabs.issuedDocumentsPanel.auditCreated')}
                                {STATUS_LABEL[e.to as ReportStatus] ?? e.to}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
