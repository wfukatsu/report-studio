import { useTranslation } from 'react-i18next'
import type { UserSummary } from '@/api/reportApi'
import { RoleBadge } from '@/components/common/RoleBadge'
import { useOidcProviderName } from '@/hooks/useOidcProviderName'

interface UserTableProps {
  readonly users: UserSummary[]
  readonly currentUserId: string | undefined
  readonly onDeleteRequest: (userId: string) => void
}

export function UserTable({ users, currentUserId, onDeleteRequest }: UserTableProps) {
  const { t } = useTranslation('components')
  const provider = useOidcProviderName()
  return (
    <table className="w-full text-xs border-collapse">
      <thead>
        <tr className="border-b text-muted-foreground">
          <th className="text-left py-1.5 pr-3 font-medium">{t('admin.userTable.colUserId')}</th>
          <th className="text-left py-1.5 pr-3 font-medium">{t('admin.userTable.colDisplayName')}</th>
          <th className="text-left py-1.5 pr-3 font-medium">{t('admin.userTable.colRole')}</th>
          <th className="text-left py-1.5 pr-3 font-medium">{t('admin.userTable.colProvider')}</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {users.map((u) => (
          <tr key={u.userId} className="group border-b hover:bg-muted/20">
            <td className="py-1.5 pr-3 font-mono">{u.userId}</td>
            <td className="py-1.5 pr-3">{u.displayName}</td>
            <td className="py-1.5 pr-3">
              <div className="flex gap-1 flex-wrap">
                {u.roles.map((r) => <RoleBadge key={r} role={r} />)}
              </div>
            </td>
            <td className="py-1.5 pr-3">
              <span
                className={u.provider === 'oidc'
                  ? 'inline-block px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-[10px] font-medium'
                  : 'inline-block px-1.5 py-0.5 rounded border border-gray-200 bg-gray-50 text-gray-600 text-[10px] font-medium'}
                title={u.provider === 'oidc' && !u.hasPassword ? t('admin.userTable.noPasswordHint', { provider }) : undefined}
              >
                {u.provider === 'oidc' ? provider : t('admin.userTable.providerLocal')}
              </span>
            </td>
            <td className="py-1.5 text-right">
              <button
                onClick={() => onDeleteRequest(u.userId)}
                disabled={u.userId === currentUserId}
                className="opacity-0 group-hover:opacity-100 text-destructive/70 hover:text-destructive disabled:opacity-20 disabled:cursor-not-allowed text-[10px] px-1 transition-opacity"
                title={u.userId === currentUserId ? t('admin.userTable.cannotDeleteSelf') : t('admin.userTable.deleteTitle', { name: u.userId })}
              >
                {t('admin.userTable.delete')}
              </button>
            </td>
          </tr>
        ))}
        {users.length === 0 && (
          <tr>
            <td colSpan={5} className="py-4 text-center text-muted-foreground">
              {t('admin.userTable.empty')}
            </td>
          </tr>
        )}
      </tbody>
    </table>
  )
}
