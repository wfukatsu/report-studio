import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store/reportStore'
import { isApiError } from '@/api/client'

/**
 * LoginModal — shown when backendConnected=true but currentUser=null.
 * Blocks the entire UI until the user authenticates.
 */
export function LoginModal() {
  const { t } = useTranslation('modals')
  const loginUser = useReportStore((s) => s.loginUser)

  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId.trim() || !password) return
    setError(null)
    setLoading(true)
    try {
      await loginUser(userId.trim(), password)
    } catch (err) {
      if (isApiError(err)) {
        if (err.status === 401) {
          setError(t('loginModal.invalidCredentials'))
        } else if (err.status === 429) {
          setError(t('loginModal.tooManyAttempts'))
        } else {
          setError(t('loginModal.loginFailed', { status: err.status }))
        }
      } else {
        setError(t('loginModal.networkError'))
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
      role="dialog"
      aria-modal="true"
      aria-labelledby="login-modal-title"
    >
      <div className="bg-background border border-border rounded-lg shadow-2xl w-80 p-6">
        <h2 id="login-modal-title" className="text-sm font-semibold mb-4 text-center">
          {t('loginModal.title')}
        </h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="login-userid" className="text-xs text-muted-foreground block mb-1">
              {t('loginModal.userId')}
            </label>
            <input
              id="login-userid"
              type="text"
              autoComplete="username"
              autoFocus
              className="border rounded px-3 py-2 text-sm w-full bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="text-xs text-muted-foreground block mb-1">
              {t('loginModal.password')}
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="border rounded px-3 py-2 text-sm w-full bg-background focus:outline-none focus:ring-2 focus:ring-primary"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 text-center" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading || !userId.trim() || !password}
            className="mt-1 w-full py-2 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? t('loginModal.loggingIn') : t('loginModal.login')}
          </button>
        </form>
      </div>
    </div>
  )
}
