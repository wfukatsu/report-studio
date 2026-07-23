import { useTranslation } from 'react-i18next'
import { TenantInfoForm } from '@/components/common/TenantInfoForm'

/**
 * Tenant-info editor hosted in the admin panel (admin role required).
 * Thin wrapper over the shared {@link TenantInfoForm} (#332): shows a heading
 * and fetches fresh tenant info on mount.
 */
export function TenantSettings() {
  const { t } = useTranslation('components')
  return <TenantInfoForm heading={t('tenantInfoForm.adminTitle')} fetchOnMount />
}
