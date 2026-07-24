import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { isApiError, parseApiErrorBody } from '@/api/client'
import { useReportStore } from '@/store/reportStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { AlertBanner } from '@/components/common/AlertBanner'
import { UserTable } from '@/components/admin/UserTable'
import { CreateUserForm } from '@/components/admin/CreateUserForm'
import { Loader2 } from 'lucide-react'
import type { UserRole } from '@/api/reportApi'

/**
 * Server `detailCode` → serverErrors key (#412). Codes outside this map fall back
 * to the generic create/delete failure message.
 */
const USER_DETAIL_KEY = {
  CANNOT_DELETE_SELF: 'adminUsers.CANNOT_DELETE_SELF',
  PASSWORD_LENGTH_INVALID: 'adminUsers.PASSWORD_LENGTH_INVALID',
  ROLE_INVALID: 'adminUsers.ROLE_INVALID',
  USERID_INVALID_CHARS: 'adminUsers.USERID_INVALID_CHARS',
  USERID_PASSWORD_REQUIRED: 'adminUsers.USERID_PASSWORD_REQUIRED',
  USERID_TOO_LONG: 'adminUsers.USERID_TOO_LONG',
  USER_ALREADY_EXISTS: 'adminUsers.USER_ALREADY_EXISTS',
  USER_NOT_FOUND: 'adminUsers.USER_NOT_FOUND',
} as const

export function UserManagement() {
  const { t } = useTranslation('components')
  const { t: tErr } = useTranslation('serverErrors')

  /** Translates a known `detailCode`; returns null when the caller should use its fallback. */
  function detailMessage(err: unknown): string | null {
    if (!isApiError(err)) return null
    const detailCode = parseApiErrorBody(err)?.detailCode
    const key = detailCode ? USER_DETAIL_KEY[detailCode as keyof typeof USER_DETAIL_KEY] : undefined
    return key ? tErr(key) : null
  }
  const currentUser = useReportStore((s) => s.currentUser)
  const users = useReportStore((s) => s.adminUsers)
  const loading = useReportStore((s) => s.adminUsersLoading)
  const storeError = useReportStore((s) => s.adminUsersError)
  const fetchUsers = useReportStore((s) => s.fetchAdminUsers)
  const createAdminUser = useReportStore((s) => s.createAdminUser)
  const deleteAdminUser = useReportStore((s) => s.deleteAdminUser)

  const [localError, setLocalError] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const error = localError ?? storeError

  useEffect(() => {
    const controller = new AbortController()
    void fetchUsers(controller.signal)
    return () => controller.abort()
  }, [fetchUsers])

  async function handleCreate(user: { userId: string; displayName?: string; password: string; roles?: UserRole[] }) {
    setLocalError(null)
    try {
      await createAdminUser(user)
    } catch (err) {
      setLocalError(detailMessage(err) ?? t('admin.userManagement.createFailed'))
    }
  }

  async function execDelete(userId: string) {
    setLocalError(null)
    try {
      await deleteAdminUser(userId)
    } catch (err) {
      setLocalError(detailMessage(err) ?? t('admin.userManagement.deleteFailed'))
    }
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center text-xs text-muted-foreground gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      {t('admin.userManagement.loading')}
    </div>
  )

  return (
    <div className="p-4 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">{t('admin.userManagement.title')}</h2>
      {error && <AlertBanner variant="error" message={error} />}

      <UserTable
        users={users}
        currentUserId={currentUser?.userId}
        onDeleteRequest={setDeleteTarget}
      />

      <CreateUserForm onSubmit={handleCreate} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title={t('admin.userManagement.deleteTitle')}
        message={t('admin.userManagement.deleteMessage', { name: deleteTarget })}
        confirmLabel={t('admin.userManagement.deleteConfirm')}
        confirmVariant="danger"
        onConfirm={() => { if (deleteTarget) void execDelete(deleteTarget); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
