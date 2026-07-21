/**
 * ConnectionBadge — shows backend connectivity status.
 * Renders nothing when connected (no noise in the happy path).
 */
import { Wifi, WifiOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store'

export function ConnectionBadge() {
  const { t } = useTranslation('components')
  const connected = useReportStore((s) => s.backendConnected)

  if (connected) return null

  return (
    <div
      role="status"
      aria-label={t('common.connectionBadge.disconnected')}
      className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      {t('common.connectionBadge.offline')}
    </div>
  )
}

export function ConnectionIndicator() {
  const { t } = useTranslation('components')
  const connected = useReportStore((s) => s.backendConnected)

  return (
    <div
      role="status"
      aria-label={connected ? t('common.connectionBadge.connected') : t('common.connectionBadge.disconnected')}
      className="flex items-center gap-1.5 text-xs"
    >
      {connected ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          <span className="text-emerald-600">{t('common.connectionBadge.online')}</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          <span className="text-amber-600">{t('common.connectionBadge.offline')}</span>
        </>
      )}
    </div>
  )
}
