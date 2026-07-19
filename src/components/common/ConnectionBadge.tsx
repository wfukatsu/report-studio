/**
 * ConnectionBadge — shows backend connectivity status.
 * Renders nothing when connected (no noise in the happy path).
 */
import { Wifi, WifiOff } from 'lucide-react'
import { useReportStore } from '@/store'

export function ConnectionBadge() {
  const connected = useReportStore((s) => s.backendConnected)

  if (connected) return null

  return (
    <div
      role="status"
      aria-label="バックエンド未接続"
      className="flex items-center gap-1.5 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800"
    >
      <WifiOff className="h-3.5 w-3.5" aria-hidden />
      オフライン
    </div>
  )
}

export function ConnectionIndicator() {
  const connected = useReportStore((s) => s.backendConnected)

  return (
    <div
      role="status"
      aria-label={connected ? 'バックエンド接続中' : 'バックエンド未接続'}
      className="flex items-center gap-1.5 text-xs"
    >
      {connected ? (
        <>
          <Wifi className="h-3.5 w-3.5 text-emerald-500" aria-hidden />
          <span className="text-emerald-600">接続中</span>
        </>
      ) : (
        <>
          <WifiOff className="h-3.5 w-3.5 text-amber-500" aria-hidden />
          <span className="text-amber-600">オフライン</span>
        </>
      )}
    </div>
  )
}
