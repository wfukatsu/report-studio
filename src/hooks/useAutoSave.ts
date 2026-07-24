/**
 * useAutoSave — 2-second debounced auto-save + sendBeacon on tab close.
 *
 * Key design points:
 * - Uses pendingRef snapshot (not get() at fire time) to prevent ghost-save:
 *   if user loads template B while A's debounce is in-flight, A's content
 *   is saved against A's ID, not B's content.
 * - Uses setTimeout + canceled flag instead of Lodash debounce: async functions
 *   wrapped by debounce swallow errors silently.
 * - sendBeacon on 'pagehide' is the only guaranteed delivery mechanism on tab close.
 * - Only fires when currentTemplateId is set (online + template loaded).
 * - #433: a failed save raises a persistent retry toast (the small indicator
 *   alone is easy to miss) and arms a beforeunload warning while in error state.
 */
import { useCallback, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store'
import { saveReport } from '@/api/reportApi'
import { isApiError } from '@/api/client'
import { AUTOSAVE_DEBOUNCE_MS } from '@/config/constants'
import { FORMAT_VERSION } from '@/lib/formatVersion'
import type { ReportDefinition } from '@/types'

/** Fixed toast id — repeated failures update one toast instead of stacking. */
const AUTOSAVE_ERROR_TOAST_ID = 'autosave-error'

export function useAutoSave(): void {
  const { t } = useTranslation('core')
  const id         = useReportStore((s) => s.currentTemplateId)
  const setSave    = useReportStore((s) => s.setSaveState)
  const definition = useReportStore((s) => s.definition)

  // Snapshot captured at schedule time — prevents ghost-save when template switches
  const pendingRef = useRef<ReportDefinition | null>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Stable self-reference for the retry toast action (a useCallback cannot
  // reference itself while it is being defined).
  const saveNowRef = useRef<(() => Promise<void>) | null>(null)

  const saveNow = useCallback(async () => {
    const snap = pendingRef.current
    if (!snap || !id) return

    setSave('saving')
    try {
      await saveReport(id, snap)
      setSave('saved')
      toast.dismiss(AUTOSAVE_ERROR_TOAST_ID)
    } catch (err) {
      setSave('error')
      if (isApiError(err)) {
        console.error('[useAutoSave] save failed:', err.status, err.message)
      } else {
        console.error('[useAutoSave] unexpected error:', err)
      }
      // #433: surface the failure with a retry action instead of relying on
      // the toolbar indicator alone.
      toast.error(t('app.toast.autoSaveFailed'), {
        id: AUTOSAVE_ERROR_TOAST_ID,
        duration: 10000,
        action: {
          label: t('app.toast.autoSaveRetry'),
          onClick: () => { void saveNowRef.current?.() },
        },
      })
    }
  }, [id, setSave, t])

  useEffect(() => {
    saveNowRef.current = saveNow
  }, [saveNow])

  useEffect(() => {
    if (!id) return

    pendingRef.current = definition

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(() => { void saveNow() }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // Keyed on the whole `definition` object (immer gives it a fresh reference on ANY content
  // change) so auto-save also fires for pageSettings / dataSources / outputVariants /
  // validationRules edits, not just pages / rules / metadata / schema (#216). Selection and
  // UI state live outside `definition`, so they don't trigger a save.
  }, [definition, id, saveNow])

  // Tab close: sendBeacon is the only guaranteed delivery mechanism on pagehide
  useEffect(() => {
    const handlePageHide = () => {
      const snap = pendingRef.current
      if (!snap || !id) return
      // Use Blob to force Content-Type: application/json — sendBeacon with a
      // plain string sends text/plain which may be rejected by the server.
      navigator.sendBeacon(
        `/api/v2/templates/${id}`,
        new Blob(
          [JSON.stringify({ formatVersion: FORMAT_VERSION, definition: snap })],
          { type: 'application/json' },
        ),
      )
    }
    window.addEventListener('pagehide', handlePageHide)
    return () => window.removeEventListener('pagehide', handlePageHide)
  }, [id])

  // #433: warn before leaving while the last auto-save is known to have failed —
  // the pagehide sendBeacon is best-effort and likely to fail against the same
  // unreachable server, so leaving now would lose the pending edits.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (useReportStore.getState().saveState === 'error') e.preventDefault()
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [])
}
