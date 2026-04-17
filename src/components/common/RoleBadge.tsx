import type { UserRole } from '@/api/reportApi'

const ROLE_CONFIG: Record<UserRole, { label: string; className: string }> = {
  admin: { label: 'Admin', className: 'bg-blue-100 text-blue-700 border-blue-200' },
  user:  { label: 'User',  className: 'bg-gray-100 text-gray-600 border-gray-200' },
}

interface RoleBadgeProps {
  readonly role: UserRole
}

export function RoleBadge({ role }: RoleBadgeProps) {
  const cfg = ROLE_CONFIG[role]
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border ${cfg.className}`}>
      {cfg.label}
    </span>
  )
}
