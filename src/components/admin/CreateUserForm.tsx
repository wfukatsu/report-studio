import { useState } from 'react'
import { UserRoleSchema } from '@/api/reportApi'
import type { UserRole } from '@/api/reportApi'

interface CreateUserFormProps {
  readonly onSubmit: (user: { userId: string; displayName?: string; password: string; roles?: UserRole[] }) => Promise<void>
}

export function CreateUserForm({ onSubmit }: CreateUserFormProps) {
  const [userId, setUserId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [creating, setCreating] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function validateForm(): boolean {
    const errors: Record<string, string> = {}
    if (!userId.trim()) errors.userId = 'ユーザーIDは必須です'
    else if (userId.length > 64) errors.userId = '64文字以内で入力してください'
    if (!password) errors.password = 'パスワードは必須です'
    else if (password.length < 8) errors.password = '8文字以上で入力してください'
    else if (password.length > 128) errors.password = '128文字以内で入力してください'
    setFieldErrors(errors)
    return Object.keys(errors).length === 0
  }

  async function handleCreate() {
    if (!validateForm()) return
    setCreating(true)
    try {
      await onSubmit({
        userId: userId.trim(),
        displayName: displayName.trim() || userId.trim(),
        password,
        roles: [role, ...(role === 'admin' ? ['user' as UserRole] : [])],
      })
      setUserId('')
      setDisplayName('')
      setPassword('')
      setRole('user')
      setFieldErrors({})
    } finally {
      setCreating(false)
    }
  }

  function handleRoleChange(value: string) {
    const parsed = UserRoleSchema.safeParse(value)
    if (parsed.success) setRole(parsed.data)
  }

  return (
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
              value={userId}
              onChange={(e) => { setUserId(e.target.value); setFieldErrors((p) => ({ ...p, userId: '' })) }}
              placeholder="user2"
            />
            {fieldErrors.userId && <p className="text-[10px] text-destructive mt-0.5">{fieldErrors.userId}</p>}
          </div>
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground">表示名</label>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
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
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })) }}
            />
            {fieldErrors.password && <p className="text-[10px] text-destructive mt-0.5">{fieldErrors.password}</p>}
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">ロール</label>
            <select
              className="border rounded px-2 py-1 text-xs bg-background block"
              value={role}
              onChange={(e) => handleRoleChange(e.target.value)}
            >
              {UserRoleSchema.options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
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
  )
}
