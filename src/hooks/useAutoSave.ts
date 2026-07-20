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
 */
import { useEffect, useRef } from 'react'
import { useReportStore } from '@/store'
import { saveReport } from '@/api/reportApi'
import { isApiError } from '@/api/client'
import { AUTOSAVE_DEBOUNCE_MS } from '@/config/constants'
import { FORMAT_VERSION } from '@/lib/formatVersion'
import type { ReportDefinition } from '@/types'

export function useAutoSave(): void {
  const id         = useReportStore((s) => s.currentTemplateId)
  const setSave    = useReportStore((s) => s.setSaveState)
  const definition = useReportStore((s) => s.definition)

  // Snapshot captured at schedule time — prevents ghost-save when template switches
  const pendingRef = useRef<ReportDefinition | null>(null)
  const timerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!id) return

    pendingRef.current = definition

    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      const snap = pendingRef.current
      if (!snap) return

      setSave('saving')
      try {
        await saveReport(id, snap)
        setSave('saved')
      } catch (err) {
        setSave('error')
        if (isApiError(err)) {
          console.error('[useAutoSave] save failed:', err.status, err.message)
        } else {
          console.error('[useAutoSave] unexpected error:', err)
        }
      }
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  // Keyed on the whole `definition` object (immer gives it a fresh reference on ANY content
  // change) so auto-save also fires for pageSettings / dataSources / outputVariants /
  // validationRules edits, not just pages / rules / metadata / schema (#216). Selection and
  // UI state live outside `definition`, so they don't trigger a save.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [definition, id])

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
}
