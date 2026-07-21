import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { UserRoleSchema } from '@/api/reportApi'
import type { UserRole } from '@/api/reportApi'

interface CreateUserFormProps {
  readonly onSubmit: (user: { userId: string; displayName?: string; password: string; roles?: UserRole[] }) => Promise<void>
}

export function CreateUserForm({ onSubmit }: CreateUserFormProps) {
  const { t } = useTranslation('components')
  const [userId, setUserId] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<UserRole>('user')
  const [creating, setCreating] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  function validateForm(): boolean {
    const errors: Record<string, string> = {}
    if (!userId.trim()) errors.userId = t('admin.createUserForm.userIdRequired')
    else if (userId.length > 64) errors.userId = t('admin.createUserForm.userIdTooLong')
    if (!password) errors.password = t('admin.createUserForm.passwordRequired')
    else if (password.length < 8) errors.password = t('admin.createUserForm.passwordTooShort')
    else if (password.length > 128) errors.password = t('admin.createUserForm.passwordTooLong')
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
    } catch {
      // Submission failed — the caller surfaces the error (toast/inline).
      // Swallow here so the click handler never produces an unhandled rejection,
      // and keep the entered values so the user can retry.
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
        {t('admin.createUserForm.title')}
      </p>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground">{t('admin.createUserForm.userIdLabel')}</label>
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
            <label className="text-[10px] text-muted-foreground">{t('admin.createUserForm.displayNameLabel')}</label>
            <input
              type="text"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={t('admin.createUserForm.displayNamePlaceholder')}
            />
          </div>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className="text-[10px] text-muted-foreground">{t('admin.createUserForm.passwordLabel')}</label>
            <input
              type="password"
              className="border rounded px-2 py-1 text-xs w-full bg-background"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setFieldErrors((p) => ({ ...p, password: '' })) }}
            />
            {fieldErrors.password && <p className="text-[10px] text-destructive mt-0.5">{fieldErrors.password}</p>}
          </div>
          <div>
            <label className="text-[10px] text-muted-foreground">{t('admin.createUserForm.roleLabel')}</label>
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
          {creating ? t('admin.createUserForm.creating') : t('admin.createUserForm.add')}
        </button>
      </div>
    </div>
  )
}
