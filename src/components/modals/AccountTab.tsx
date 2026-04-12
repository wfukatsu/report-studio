import { useState } from 'react'
import { useReportStore } from '@/store/reportStore'
import { changeProfile } from '@/api/reportApi'
import { isApiError } from '@/api/client'

export function AccountTab() {
  const currentUser = useReportStore((s) => s.currentUser)

  const [displayName, setDisplayName] = useState(currentUser?.displayName ?? '')
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setError(null)
    setSuccess(false)

    if (newPassword && newPassword !== confirmPassword) {
      setError('新しいパスワードが一致しません')
      return
    }
    if (newPassword && !currentPassword) {
      setError('パスワードを変更するには現在のパスワードが必要です')
      return
    }

    setSaving(true)
    try {
      const patch: Parameters<typeof changeProfile>[0] = {}
      if (displayName.trim() && displayName.trim() !== currentUser?.displayName) {
        patch.displayName = displayName.trim()
      }
      if (newPassword) {
        patch.currentPassword = currentPassword
        patch.newPassword = newPassword
      }
      if (Object.keys(patch).length === 0) {
        setError('変更がありません')
        setSaving(false)
        return
      }
      await changeProfile(patch)
      setSuccess(true)
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      if (isApiError(err) && err.status === 401) {
        setError('現在のパスワードが正しくありません')
      } else {
        setError('保存に失敗しました')
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="p-5 flex flex-col gap-4 max-w-md">
      <div>
        <p className="text-xs text-muted-foreground mb-1">ユーザーID</p>
        <p className="text-sm font-mono text-foreground/70">{currentUser?.userId}</p>
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">表示名</label>
        <input
          type="text"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </div>

      <hr className="border-border" />

      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">パスワード変更</p>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">現在のパスワード</label>
        <input
          type="password"
          autoComplete="current-password"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          placeholder="変更する場合のみ入力"
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">新しいパスワード</label>
        <input
          type="password"
          autoComplete="new-password"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">新しいパスワード（確認）</label>
        <input
          type="password"
          autoComplete="new-password"
          className="border rounded px-3 py-1.5 text-sm w-full bg-background"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {success && <p className="text-xs text-green-600">保存しました</p>}

      <button
        onClick={handleSave}
        disabled={saving}
        className="px-4 py-1.5 text-sm bg-primary text-primary-foreground rounded hover:opacity-90 disabled:opacity-50 w-fit"
      >
        {saving ? '保存中...' : '保存'}
      </button>
    </div>
  )
}
