import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store/reportStore'
import { isApiError } from '@/api/client'
import { useModalA11y } from '@/hooks/useModalA11y'
import { navigateTo } from '@/lib/browserNavigation'
import { readOidcRedirectParams, stripOidcRedirectParams, type OidcErrorCode } from '@/lib/oidcRedirect'

/** The login gate cannot be dismissed — Esc is intentionally a no-op (#428). */
const NOOP_CLOSE = () => {}

/**
 * LoginModal — shown when backendConnected=true but currentUser=null.
 * Blocks the entire UI until the user authenticates.
 */
export function LoginModal() {
  const { t } = useTranslation('modals')
  const loginUser = useReportStore((s) => s.loginUser)
  // null until /me answered — treat as "password only" so the form is never blank (#499)
  const authOptions = useReportStore((s) => s.authOptions)
  const oidcEnabled = authOptions?.oidcEnabled === true && !!authOptions.oidcLoginUrl
  const localEnabled = authOptions?.localLoginEnabled !== false || !oidcEnabled

  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  // The OIDC callback's ?oidc_error= is read purely here and stripped in an effect below, so the
  // initializer stays side-effect free (StrictMode / discarded renders). The code, not the
  // translated text, is stored so a language switch re-renders the message.
  const [oidcError, setOidcError] = useState<OidcErrorCode | null>(() => readOidcRedirectParams().error)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  useEffect(() => { stripOidcRedirectParams() }, [])

  // #428: focus trap only — the login gate must not be dismissible via Esc.
  // Initial focus goes to the user-id field whenever the password form is shown (the Keycloak
  // button sits first in DOM order and would otherwise capture it, making Enter leave the app).
  const userIdRef = useRef<HTMLInputElement>(null)
  const { dialogRef } = useModalA11y({
    open: true,
    onClose: NOOP_CLOSE,
    initialFocus: localEnabled ? userIdRef : undefined,
  })
  const message = error ?? (oidcError ? t(`loginModal.oidcError.${oidcError}`) : null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!userId.trim() || !password) return
    setError(null)
    setOidcError(null)
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
      aria-describedby={message ? 'login-error' : undefined}
    >
      <div ref={dialogRef} className="bg-background border border-border rounded-lg shadow-2xl w-80 p-6">
        <h2 id="login-modal-title" className="text-sm font-semibold mb-4 text-center">
          {t('loginModal.title')}
        </h2>

        {message && (
          <p id="login-error" className="text-xs text-red-500 text-center mb-3" role="alert">
            {message}
          </p>
        )}

        {oidcEnabled && (
          <button
            type="button"
            onClick={() => navigateTo(authOptions!.oidcLoginUrl!)}
            disabled={loading}
            className="w-full py-2 text-sm border border-primary text-primary rounded hover:bg-primary/10 disabled:opacity-50 transition-colors"
          >
            {t('loginModal.oidcLogin')}
          </button>
        )}

        {oidcEnabled && localEnabled && (
          <div className="flex items-center gap-2 my-3 text-[10px] text-muted-foreground uppercase tracking-wide">
            <span className="flex-1 border-t border-border" />
            {t('loginModal.or')}
            <span className="flex-1 border-t border-border" />
          </div>
        )}

        {localEnabled && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label htmlFor="login-userid" className="text-xs text-muted-foreground block mb-1">
              {t('loginModal.userId')}
            </label>
            <input
              id="login-userid"
              ref={userIdRef}
              type="text"
              autoComplete="username"
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

          <button
            type="submit"
            disabled={loading || !userId.trim() || !password}
            className="mt-1 w-full py-2 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
          >
            {loading ? t('loginModal.loggingIn') : t('loginModal.login')}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
