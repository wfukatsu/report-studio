import { useEffect, useState } from 'react'
import { listUsers, createUser, deleteUser } from '@/api/reportApi'
import type { UserSummary, UserRole } from '@/api/reportApi'
import { useReportStore } from '@/store/reportStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'
import { RoleBadge } from '@/components/common/RoleBadge'

export function UserManagement() {
  const currentUser = useReportStore((s) => s.currentUser)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [newUserId, setNewUserId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<UserRole>('user')
  const [creating, setCreating] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const list = await listUsers(controller.signal)
        setUsers(list)
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError('ユーザー一覧の取得に失敗しました')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [])

  function validateForm(): boolean {
    const errors: Record<string, string> = {}
    if (!newUserId.trim()) errors.userId = 'ユーザーIDは必須です'
    else if (newUserId.length > 64) errors.userId = '64文字以内で入力してください'
    if (!newPassword) errors.password = 'パスワードは必須です'
    else if (newPassword.length < 8) errors.password = '8文字以上で入力してください'
    else if (newPassword.length > 128) errors.password = '128文字以内で入力してください'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleCreate() {
    if (!validateForm()) return
    setCreating(true)
    setError(null)
    try {
      const created = await createUser({
        userId: newUserId.trim(),
        displayName: newDisplayName.trim() || newUserId.trim(),
        password: newPassword,
        roles: [newRole, ...(newRole === 'admin' ? ['user' as UserRole] : [])],
      })
      setUsers((prev) => [...prev, created])
      setNewUserId('')
      setNewDisplayName('')
      setNewPassword('')
      setNewRole('user')
      setFieldErrors({})
    } catch {
      setError('ユーザーの作成に失敗しました（IDが重複している可能性があります）')
    } finally {
      setCreating(false)
    }
  }

  async function execDelete(userId: string) {
    try {
      await deleteUser(userId)
      setUsers((prev) => prev.filter((u) => u.userId !== userId))
    } catch {
      setError('削除に失敗しました')
    }
  }

  if (loading) return (
    <div className="p-8 flex items-center justify-center text-xs text-muted-foreground gap-2">
      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
      </svg>
      読み込み中...
    </div>
  )

  return (
    <div className="p-4 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-foreground">ユーザー管理</h2>
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* User list */}
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b text-muted-foreground">
            <th className="text-left py-1.5 pr-3 font-medium">ユーザーID</th>
            <th className="text-left py-1.5 pr-3 font-medium">表示名</th>
            <th className="text-left py-1.5 pr-3 font-medium">ロール</th>
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
              <td className="py-1.5 text-right">
                <button
                  onClick={() => setDeleteTarget(u.userId)}
                  disabled={u.userId === currentUser?.userId}
                  className="opacity-0 group-hover:opacity-100 text-destructive/70 hover:text-destructive disabled:opacity-20 disabled:cursor-not-allowed text-[10px] px-1 transition-opacity"
                  title={u.userId === currentUser?.userId ? '自分自身は削除できません' : `${u.userId} を削除`}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={4} className="py-4 text-center text-muted-foreground">
                ユーザーがいません
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {/* Create user form */}
      <div className="border rounded-md p-3 bg-muted/20">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          ユーザーを追加
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">ユーザーID *</label>
              <input
                type="text"
                className="border rounded px-2 py-1 text-xs w-full bg-background font-mono"
                value={newUserId}
                onChange={(e) => { setNewUserId(e.target.value); setFieldErrors((p) => ({ ...p, userId: '' })) }}
                placeholder="user2"
              />
              {fieldErrors.userId && <p className="text-[10px] text-destructive mt-0.5">{fieldErrors.userId}</p>}
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">表示名</label>
              <input
                type="text"
                className="border rounded px-2 py-1 text-xs w-full bg-background"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
                placeholder="ユーザー2"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground">パスワード * (8〜128文字)</label>
              <input
                type="password"
                className="border rounded px-2 py-1 text-xs w-full bg-background"
                value={newPassword}
                onChange={(e) => { setNewPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })) }}
              />
              {fieldErrors.password && <p className="text-[10px] text-destructive mt-0.5">{fieldErrors.password}</p>}
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">ロール</label>
              <select
                className="border rounded px-2 py-1 text-xs bg-background block"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 w-fit"
          >
            {creating ? '作成中...' : '+ 追加'}
          </button>
        </div>
      </div>

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
