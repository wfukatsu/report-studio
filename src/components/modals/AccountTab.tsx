import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useReportStore } from '@/store/reportStore'
import { changeProfile } from '@/api/reportApi'
import { isApiError, parseApiErrorBody } from '@/api/client'
import { navigateTo } from '@/lib/browserNavigation'
import { useOidcProviderName } from '@/hooks/useOidcProviderName'

export function AccountTab() {
  const { t } = useTranslation('modals')
  const currentUser = useReportStore((s) => s.currentUser)
  const authOptions = useReportStore((s) => s.authOptions)
  const provider = useOidcProviderName()
  const oidcLoginUrl = authOptions?.oidcEnabled === true && authOptions.oidcLinkEnabled === true
    ? authOptions.oidcLoginUrl : undefined
  // OIDC-provisioned accounts have no local password (#499); older servers omit the flag → assume yes
  const canChangePassword = currentUser?.hasPassword !== false
  // Explicit IdP linking for password accounts (#499 H1): offered only when the server allows it
  const canLink = !!oidcLoginUrl && currentUser?.provider === 'local' && canChangePassword
  const linked = currentUser?.oidcLinked === true

  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    setSuccess(false)

    if (newPassword && newPassword !== confirmPassword) {
      setError(t('accountTab.passwordMismatch'))
      return
    }
    if (newPassword && !currentPassword) {
      setError(t('accountTab.currentPasswordRequired'))
      return
    }

    setSaving(true)
    try {
      const patch: Parameters<typeof changeProfile>[0] = {}
      if (displayName.trim() && displayName.trim() !== currentUser?.displayName) {
        patch.displayName = displayName.trim()
      }
      if (newPassword) {
        patch.currentPassword = currentPassword
        patch.newPassword = newPassword
      }
      if (Object.keys(patch).length === 0) {
        setError(t('accountTab.noChanges'))
        setSaving(false)
        return
      }
      await changeProfile(patch)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setError(t('accountTab.currentPasswordWrong'))
      } else if (isApiError(err) && parseApiErrorBody(err)?.detailCode === 'PASSWORD_MANAGED_EXTERNALLY') {
        setError(t('accountTab.passwordManagedExternallyError', { provider }))
      } else {
        setError(t('accountTab.saveFailed'))
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 flex flex-col gap-4 max-w-md">
      <div>
        <p className="text-xs text-muted-foreground mb-1">{t('accountTab.userId')}</p>
        <p className="text-sm font-mono text-foreground/70">{currentUser?.userId}</p>
      </div>

      <div>
        <label htmlFor="account-display-name" className="text-xs text-muted-foreground block mb-1">{t('accountTab.displayName')}</label>
        <input
          id="account-display-name"
          type="text"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <hr className="border-border" />

      {canChangePassword ? (<>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('accountTab.changePassword')}</p>

      <div>
        <label htmlFor="account-current-password" className="text-xs text-muted-foreground block mb-1">{t('accountTab.currentPassword')}</label>
        <input
          id="account-current-password"
          type="password"
          autoComplete="current-password"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder={t('accountTab.currentPasswordPlaceholder')}
        />
      </div>
      <div>
        <label htmlFor="account-new-password" className="text-xs text-muted-foreground block mb-1">{t('accountTab.newPassword')}</label>
        <input
          id="account-new-password"
          type="password"
          autoComplete="new-password"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div>
        <label htmlFor="account-confirm-password" className="text-xs text-muted-foreground block mb-1">{t('accountTab.confirmPassword')}</label>
        <input
          id="account-confirm-password"
          type="password"
          autoComplete="new-password"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      </>) : (
        <p className="text-xs text-muted-foreground">{t('accountTab.passwordManagedExternally', { provider })}</p>
      )}

      {(canLink || linked) && (
        <>
          <hr className="border-border" />
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{t('accountTab.oidcLink.title', { provider })}</p>
          {linked ? (
            <p className="text-xs text-muted-foreground">{t('accountTab.oidcLink.linked', { provider })}</p>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">{t('accountTab.oidcLink.hint', { provider })}</p>
              <button
                type="button"
                onClick={() => navigateTo(`${oidcLoginUrl}?link=1`)}
                className="px-4 py-1.5 text-sm border border-primary text-primary rounded hover:bg-primary/10 w-fit"
              >
                {t('accountTab.oidcLink.button', { provider })}
              </button>
            </>
          )}
        </>
      )}

      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-green-600">{t('accountTab.saved')}</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 w-fit"
      >
        {saving ? t('accountTab.saving') : t('accountTab.save')}
      </button>
    </div>
  )
}
