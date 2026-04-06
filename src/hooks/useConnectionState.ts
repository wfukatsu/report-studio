/**
 * useConnectionState — tracks V1 backend connectivity.
 *
 * Two-layered detection:
 * 1. navigator.onLine — instant browser offline detection
 * 2. HEAD /api/v2/health every 30s — detects V1 backend down while browser is online
 *
 * Sets store.backendConnected accordingly.
 * Components read backendConnected from the store directly.
 */
import { useEffect } from 'react'
import { useReportStore } from '@/store'
import { checkHealth } from '@/api/reportApi'

const PROBE_INTERVAL_MS = 30_000

export function useConnectionState(): void {
  const setBackendConnected = useReportStore((s) => s.setBackendConnected)

  useEffect(() => {
    let probeTimer: ReturnType<typeof setInterval> | null = null

    async function probe() {
      if (!navigator.onLine) {
        setBackendConnected(false)
        return
      }
      const healthy = await checkHealth()
      setBackendConnected(healthy)
    }

    // Immediate probe on mount
    probe()

    probeTimer = setInterval(probe, PROBE_INTERVAL_MS)

    const handleOnline  = () => probe()
    const handleOffline = () => setBackendConnected(false)

    window.addEventListener('online',  handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      if (probeTimer) clearInterval(probeTimer)
      window.removeEventListener('online',  handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [setBackendConnected])
}
