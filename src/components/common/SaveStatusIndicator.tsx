/**
 * SaveStatusIndicator — shows auto-save state.
 * Renders nothing in 'idle' state (no noise before first save).
 */
import { Check, Loader2, AlertCircle, Save } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store'
import type { SaveState } from '@/store/types'

interface LabelMap {
  idle: null
  saving: string
  saved: string
  error: string
}

export function SaveStatusIndicator() {
  const { t } = useTranslation('components')
  const saveState = useReportStore((s) => s.saveState) as SaveState

  if (saveState === 'idle') return null

  const labels: LabelMap = {
    idle:   null,
    saving: t('common.saveStatusIndicator.saving'),
    saved:  t('common.saveStatusIndicator.saved'),
    error:  t('common.saveStatusIndicator.error'),
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={labels[saveState] ?? saveState}
      className="flex items-center gap-1.5 text-xs"
    >
      {saveState === 'saving' && (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" aria-hidden />
          <span className="text-blue-600">{labels.saving}</span>
        </>
      )}
      {saveState === 'saved' && (
        <>
          <Check className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          <span className="text-emerald-600">{labels.saved}</span>
        </>
      )}
      {saveState === 'error' && (
        <>
          <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-hidden />
          <span className="text-red-600">{labels.error}</span>
        </>
      )}
    </div>
  )
}

export { Save }
