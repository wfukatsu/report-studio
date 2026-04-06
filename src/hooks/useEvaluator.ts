/**
 * useEvaluator — debounced expression evaluation against V1 backend.
 *
 * Design points:
 * - Global hook: mount at app level, one instance only (not per-element).
 * - React selector + useEffect deps pattern — no subscribeWithSelector middleware needed.
 * - useShallow on both selectors: loadReport/importReportJSON replace the entire
 *   definition object, generating new array/object references even if content is
 *   unchanged. useShallow compares element *references* (not deep values); immer
 *   generates new refs only for modified items, so this is correct and efficient.
 * - AbortController captured as a local variable: abortRef.current is overwritten
 *   when a new request starts, so reading it after `await` would reference the
 *   new controller. The local `controller` variable is stable throughout the async
 *   lifecycle of each individual request.
 * - Guarded finally: abort済みの場合はクリアしない（後続リクエストが in-flight 中の
 *   loading=true を消さないため）。アンマウント時は unmount cleanup が明示クリアする。
 * - state read at fire time (not schedule time): unlike useAutoSave which snapshots
 *   at schedule time to prevent ghost-saves, evaluation should always use the latest
 *   state — there is no "wrong-template" scenario here.
 */
import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/shallow'
import { useReportStore } from '@/store'
import { evaluateCalculations } from '@/api/reportApi'
import type { ReportDefinitionInput } from '@/lib/schemas/reportDefinition'
import { EVAL_DEBOUNCE_MS } from '@/config/constants'

export function useEvaluator(): void {
  const calculationRules = useReportStore(useShallow((s) => s.definition.calculationRules))
  const testData = useReportStore(useShallow((s) => s.testData))

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    timerRef.current = setTimeout(async () => {
      const { definition, testData: currentTestData, currentTemplateId } =
        useReportStore.getState()
      if (!currentTemplateId || definition.calculationRules.length === 0) return

      // Cancel the previous in-flight HTTP request
      abortRef.current?.abort()
      const controller = new AbortController()  // local capture — stable after await
      abortRef.current = controller

      useReportStore.getState().setComputedLoading(true)
      try {
        const result = await evaluateCalculations(
          currentTemplateId,
          definition as unknown as ReportDefinitionInput,
          currentTestData,
          controller.signal,
        )
        // Use local `controller`, not abortRef.current (may be overwritten by next request)
        if (controller.signal.aborted) return
        useReportStore.getState().setComputedResults(result)
      } catch (err) {
        if (controller.signal.aborted) return  // AbortError — ignore silently
        useReportStore.getState().setComputedResults({
          results: {},
          errors: { _global: String(err) },
        })
      } finally {
        // Only clear loading if this request was NOT aborted.
        // If aborted, a subsequent request is (or will be) in-flight with loading=true —
        // clearing here would incorrectly hide that state.
        // Unmount abort is handled by the separate cleanup useEffect below.
        if (!controller.signal.aborted) {
          useReportStore.getState().setComputedLoading(false)
        }
      }
    }, EVAL_DEBOUNCE_MS)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [calculationRules, testData])

  // On unmount: abort any in-flight request and explicitly clear loading.
  // The guarded finally skips the clear when aborted, so this cleanup is
  // the only path that clears loading on unmount. Zustand store actions are
  // safe to call outside React component lifecycle — no mounted-ref guard needed.
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
      useReportStore.getState().setComputedLoading(false)
    }
  }, [])
}
