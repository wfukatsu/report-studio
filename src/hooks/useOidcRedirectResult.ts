import { useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useReportStore } from '@/store/reportStore'
import { consumeOidcRedirectParams } from '@/lib/oidcRedirect'

/**
 * Surfaces the outcome of an OIDC round-trip that lands on a *signed-in* app
 * (the account-link flow, `?oidc_linked=1` / `?oidc_error=…`). The anonymous
 * case is handled by LoginModal, which is only mounted when nobody is signed
 * in — so exactly one of the two consumes (and strips) the query parameters.
 */
export function useOidcRedirectResult() {
  const { t } = useTranslation('modals')
  const authLoading = useReportStore((s) => s.authLoading)
  const signedIn = useReportStore((s) => s.currentUser !== null)
  useEffect(() => {
    if (authLoading || !signedIn) return
    const result = consumeOidcRedirectParams()
    if (result.linked) toast.success(t('accountTab.oidcLink.success'))
    if (result.error) toast.error(t(`loginModal.oidcError.${result.error}`))
  }, [authLoading, signedIn, t])
}
