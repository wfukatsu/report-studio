/**
 * SaveStatusIndicator — shows auto-save state.
 * Renders nothing in 'idle' state (no noise before first save).
 */
import { Check, Loader2, AlertCircle, Save } from 'lucide-react'
import { useReportStore } from '@/store'
import type { SaveState } from '@/store/types'

interface LabelMap {
  idle: null
  saving: string
  saved: string
  error: string
}

const LABELS: LabelMap = {
  idle:   null,
  saving: '保存中...',
  saved:  '保存済み',
  error:  '保存失敗',
}

export function SaveStatusIndicator() {
  const saveState = useReportStore((s) => s.saveState) as SaveState

  if (saveState === 'idle') return null

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={LABELS[saveState] ?? saveState}
      className="flex items-center gap-1.5 text-xs"
    >
      {saveState === 'saving' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" aria-hidden />
          <span className="text-blue-600">{LABELS.saving}</span>
        </>
      )}
      {saveState === 'saved' && (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          <span className="text-emerald-600">{LABELS.saved}</span>
        </>
      )}
      {saveState === 'error' && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-hidden />
          <span className="text-red-600">{LABELS.error}</span>
        </>
      )}
    </div>
  )
}

export { Save }
