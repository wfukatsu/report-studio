import { useEffect, useState } from 'react'
import { listUsers, createUser, deleteUser } from '@/api/reportApi'
import type { UserSummary } from '@/api/reportApi'
import { useReportStore } from '@/store/reportStore'
import { ConfirmDialog } from '@/components/common/ConfirmDialog'

export function AdminUsersTab() {
  const currentUser = useReportStore((s) => s.currentUser)
  const [users, setUsers] = useState<UserSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Create form
  const [newUserId, setNewUserId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'user' | 'admin'>('user')
  const [creating, setCreating] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      setLoading(true)
      const list = await listUsers()
      setUsers(list)
    } catch {
      setError('ユーザー一覧の取得に失敗しました')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate() {
    if (!newUserId.trim() || !newPassword) return
    setCreating(true)
    try {
      const created = await createUser({
        userId: newUserId.trim(),
        displayName: newDisplayName.trim() || newUserId.trim(),
        password: newPassword,
        roles: [newRole, ...(newRole === 'admin' ? ['user'] : [])],
      })
      setUsers((prev) => [...prev, created])
      setNewUserId('')
      setNewDisplayName('')
      setNewPassword('')
      setNewRole('user')
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

  function handleDelete(userId: string) {
    setDeleteTarget(userId)
  }

  if (loading) return <div className="p-5 text-xs text-muted-foreground">読み込み中...</div>

  return (
    <div className="p-4 flex flex-col gap-4">
      {error && <p className="text-xs text-red-500">{error}</p>}

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
            <tr key={u.userId} className="border-b hover:bg-muted/20">
              <td className="py-1.5 pr-3 font-mono">{u.userId}</td>
              <td className="py-1.5 pr-3">{u.displayName}</td>
              <td className="py-1.5 pr-3">
                {u.roles.includes('admin') ? (
                  <span className="text-blue-600 font-medium">admin</span>
                ) : (
                  <span className="text-muted-foreground">user</span>
                )}
              </td>
              <td className="py-1.5 text-right">
                <button
                  onClick={() => handleDelete(u.userId)}
                  disabled={u.userId === currentUser?.userId}
                  className="text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed text-[10px] px-1"
                  title={u.userId === currentUser?.userId ? '自分自身は削除できません' : '削除'}
                >
                  削除
                </button>
              </td>
            </tr>
          ))}
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
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="user2"
              />
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
              <label className="text-[10px] text-muted-foreground">パスワード *</label>
              <input
                type="password"
                className="border rounded px-2 py-1 text-xs w-full bg-background"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground">ロール</label>
              <select
                className="border rounded px-2 py-1 text-xs bg-background"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as 'user' | 'admin')}
              >
                <option value="user">user</option>
                <option value="admin">admin</option>
              </select>
            </div>
          </div>
          <button
            onClick={handleCreate}
            disabled={creating || !newUserId.trim() || !newPassword}
            className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 w-fit"
          >
            {creating ? '作成中...' : '+ 追加'}
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="ユーザーを削除"
        message={`ユーザー「${deleteTarget}」を削除しますか？`}
        confirmLabel="削除"
        confirmVariant="danger"
        onConfirm={() => { if (deleteTarget) void execDelete(deleteTarget); setDeleteTarget(null) }}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  )
}
