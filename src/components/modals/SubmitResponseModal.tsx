/**
 * SubmitResponseModal — confirm and submit the current testData as a form response.
 *
 * Design:
 * - Shows the current testData fields for review before submission
 * - Submits via submitResponse() API call
 * - Invalidates the responses cache on success so the list auto-refreshes
 * - Modal state managed in Zustand (submitResponseModalOpen)
 */

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { X, Send, Loader2, CheckCircle2 } from 'lucide-react'
import { useShallow } from 'zustand/shallow'
import { useReportStore } from '@/store'
import { submitResponse } from '@/api/reportApi'
import { useModalA11y } from '@/hooks/useModalA11y'

export function SubmitResponseModal() {
  const { t } = useTranslation('modals')
  const open = useReportStore((s) => s.submitResponseModalOpen)
  const close = useReportStore((s) => s.closeSubmitResponseModal)
  const invalidateResponsesCache = useReportStore((s) => s.invalidateResponsesCache)
  const currentTemplateId = useReportStore((s) => s.currentTemplateId)
  const testData = useReportStore(useShallow((s) => s.testData))

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  const handleClose = () => {
    setSubmitted(false)
    setError(null)
    close()
  }

  // #428: focus trap + Esc + opener focus restore
  const { dialogRef } = useModalA11y({ open, onClose: handleClose })

  if (!open) return null

  const dataEntries = Object.entries(testData).filter(([, v]) => v !== undefined && v !== null)

  const handleSubmit = async () => {
    if (!currentTemplateId || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await submitResponse(currentTemplateId, testData)
      invalidateResponsesCache()
      setSubmitted(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('submitResponseModal.errorSubmit'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label={t('submitResponseModal.title')}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose() }}
    >
      <div ref={dialogRef} className="bg-background rounded-lg shadow-xl w-96 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="text-sm font-semibold">{t('submitResponseModal.heading')}</h2>
          <button
            onClick={handleClose}
            className="rounded hover:bg-accent p-1"
            aria-label={t('submitResponseModal.close')}
          >
            <X className="w-4 h-4" />
          </button>
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {submitted ? (
            <div className="flex flex-col items-center gap-3 py-6 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
              <p className="text-sm font-medium">{t('submitResponseModal.submittedTitle')}</p>
              <p className="text-xs text-muted-foreground">{t('submitResponseModal.submittedHint')}</p>
            </div>
          ) : (
            <>
              <p className="text-xs text-muted-foreground mb-3">
                {t('submitResponseModal.confirmText')}
              </p>
              {dataEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {t('submitResponseModal.noData')}
                </p>
              ) : (
                <div className="space-y-1.5 max-h-72 overflow-y-auto">
                  {dataEntries.map(([key, value]) => (
                    <div key={key} className="flex gap-2 text-xs border-b border-gray-100 pb-1.5">
                      <span className="font-medium text-gray-600 min-w-0 truncate basis-1/3">{key}</span>
                      <span className="text-gray-800 min-w-0 truncate basis-2/3">
                        {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {error && (
                <p className="mt-3 text-xs text-red-600" role="alert">{error}</p>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="flex justify-end gap-2 px-4 py-3 border-t shrink-0">
          {submitted ? (
            <button
              onClick={handleClose}
              className="px-3 py-1.5 text-sm rounded bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {t('submitResponseModal.close')}
            </button>
          ) : (
            <>
              <button
                onClick={handleClose}
                className="px-3 py-1.5 text-sm rounded border hover:bg-accent"
                disabled={submitting}
              >
                {t('submitResponseModal.cancel')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting || dataEntries.length === 0}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded
                           bg-primary text-primary-foreground hover:bg-primary/90
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
                {t('submitResponseModal.submit')}
              </button>
            </>
          )}
        </footer>
      </div>
    </div>
  )
}
