import { useEffect, useState } from 'react'
import { useReportStore } from '@/store/reportStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { AlertBanner } from '@/components/common/AlertBanner'
import { UserTable } from '@/components/admin/UserTable'
import { CreateUserForm } from '@/components/admin/CreateUserForm'
import { Loader2 } from 'lucide-react'
import type { UserRole } from '@/api/reportApi'

export function UserManagement() {
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
    } catch {
      setLocalError('ユーザーの作成に失敗しました（IDが重複している可能性があります）')
    }
  }

  async function execDelete(userId: string) {
    setLocalError(null)
    try {
      await deleteAdminUser(userId)
    } catch {
      setLocalError('削除に失敗しました')
    }
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center text-xs text-muted-foreground gap-2">
      <Loader2 className="w-4 h-4 animate-spin" />
      読み込み中...
    </div>
  )

  return (
    <div className="p-4 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">ユーザー管理</h2>
      {error && <AlertBanner variant="error" message={error} />}

      <UserTable
        users={users}
        currentUserId={currentUser?.userId}
        onDeleteRequest={setDeleteTarget}
      />

      <CreateUserForm onSubmit={handleCreate} />

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ユーザーを削除"
        message={`ユーザー「${deleteTarget}」を完全に削除します。この操作は元に戻せません。`}
        confirmLabel="削除する"
        confirmVariant="danger"
        onConfirm={() => { if (deleteTarget) void execDelete(deleteTarget); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
