import { TenantInfoForm } from '@/components/common/TenantInfoForm'

/**
 * Tenant-info editor hosted in the data-settings modal tab.
 * Thin wrapper over the shared {@link TenantInfoForm} (#332); the modal already
 * provides a title bar, so no heading is passed.
 */
export function TenantInfoTab() {
  return <TenantInfoForm />
}
