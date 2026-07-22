/**
 * InlineErrorBanner — small in-panel banner for user-facing API errors.
 *
 * Pairs `classifyError` with `getErrorCopy` and provides:
 * - Title + hint in plain Japanese (no HTTP status numbers)
 * - Optional retry action when the error is retryable
 * - Dev-only `<details>` with HTTP status / correlation id for debugging
 *
 * Layout intentionally mirrors the existing amber/destructive callout style
 * used across the sidebar so the look does not regress.
 */
import { AlertCircle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { classifyError, type UserFacingError } from '@/lib/userFacingError'
import { getErrorCopy } from '@/lib/userFacingErrorMessages'
import { cn } from '@/lib/utils'

interface Props {
  /**
   * Any caught value. Plain errors are passed through `classifyError`; a
   * pre-classified `UserFacingError` is detected by `isClassified` and used
   * as-is. Callers that already need `retryable` to drive other UI should
   * pre-classify and pass the result here.
   */
  error: unknown
  /** Optional retry handler. Hidden when the classified error is not retryable. */
  onRetry?: () => void
  /** Visual tone. Defaults to amber for connection-style errors. */
  tone?: 'amber' | 'destructive'
  /** Extra class on the wrapper. */
  className?: string
}

function isClassified(value: unknown): value is UserFacingError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    'retryable' in value
  )
}

export function InlineErrorBanner({ error, onRetry, tone = 'amber', className }: Props) {
  const { t } = useTranslation('components')
  const { t: tErr } = useTranslation('serverErrors')
  const classified = isClassified(error) ? error : classifyError(error)
  const copy = getErrorCopy(classified.code, tErr)
  const showRetry = classified.retryable && typeof onRetry === 'function'

  return (
    <div
      role="alert"
      className={cn(
        'flex items-start gap-2 px-3 py-2 rounded border text-xs',
        tone === 'amber'
          ? 'bg-amber-50 border-amber-200 text-amber-800'
          : 'bg-destructive/10 border-destructive/30 text-destructive',
        className,
      )}
    >
      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 min-w-0 space-y-0.5">
        <p className="font-medium">{copy.title}</p>
        <p className="opacity-90">{copy.hint}</p>
        {showRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-1 text-primary hover:underline font-medium"
          >
            {t('common.inlineErrorBanner.retry')}
          </button>
        )}
        {import.meta.env.DEV && classified.correlationId && (
          <details className="mt-1 opacity-70">
            <summary className="cursor-pointer text-[10px]">{t('common.inlineErrorBanner.techInfo')}</summary>
            <p className="font-mono text-[10px] break-all">
              code: {classified.code}
              <br />
              correlationId: {classified.correlationId}
            </p>
          </details>
        )}
      </div>
    </div>
  )
}
