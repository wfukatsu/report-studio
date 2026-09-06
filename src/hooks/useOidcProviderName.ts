import { useReportStore } from '@/store/reportStore'

/** IdP label for UI copy — from the server's `OIDC_PROVIDER_NAME`, "Keycloak" until known. */
export function useOidcProviderName(): string {
  return useReportStore((s) => s.authOptions?.oidcProviderName) ?? 'Keycloak'
}
