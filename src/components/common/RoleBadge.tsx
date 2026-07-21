import { useTranslation } from 'react-i18next'
import type { UserRole } from '@/api/reportApi'

const ROLE_CONFIG = {
  admin: { labelKey: 'common.roleBadge.admin', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  user:  { labelKey: 'common.roleBadge.user',  className: 'bg-gray-100 text-gray-600 border-gray-200' },
} as const satisfies Record<UserRole, { labelKey: string; className: string }>

interface RoleBadgeProps {
  readonly role: UserRole
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const { t } = useTranslation('components')
  const cfg = ROLE_CONFIG[role]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.className}`}>
      {t(cfg.labelKey)}
    </span>
  )
}
