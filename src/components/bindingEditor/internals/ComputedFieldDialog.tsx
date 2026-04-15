/**
 * ComputedFieldDialog — Modal for creating/editing computed (formula) fields.
 *
 * Simplified v2 implementation using shadcn Dialog and basic textarea.
 * Full CodeMirror integration can be added later.
 */

import { memo, useCallback, useState } from 'react'
import { FunctionSquare, AlertCircle } from 'lucide-react'
import type { SchemaGroup } from '@/types'

interface ComputedFieldDialogProps {
  readonly open: boolean
  readonly groupId: string
  readonly groups: readonly SchemaGroup[]
  readonly initialName?: string
  readonly initialExpression?: string
  readonly editingFieldId?: string
  readonly onClose: () => void
  readonly onSave: (name: string, expression: string) => void
}

export const ComputedFieldDialog = memo(function ComputedFieldDialog({
  open,
  groupId,
  groups,
  initialName,
  initialExpression,
  editingFieldId,
  onClose,
  onSave,
}: ComputedFieldDialogProps) {
  const [name, setName] = useState(initialName ?? '')
  const [expression, setExpression] = useState(initialExpression ?? '')
  const [error, setError] = useState<string | null>(null)

  const group = groups.find((g) => g.id === groupId)
  const isEditing = editingFieldId != null

  const validate = useCallback(() => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError('フィールド名を入力してください')
      return false
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(trimmedName)) {
      setError('フィールド名は英数字とアンダースコアのみ使用可能です')
      return false
    }
    // Check for duplicate name in same group
    if (group) {
      const duplicate = group.fields.find(
        (f) => f.key === trimmedName && f.id !== editingFieldId,
      )
      if (duplicate) {
        setError(`フィールド名 "${trimmedName}" は既に使用されています`)
        return false
      }
    }
    if (!expression.trim()) {
      setError('計算式を入力してください')
      return false
    }
    setError(null)
    return true
  }, [name, expression, group, editingFieldId])

  const handleSave = useCallback(() => {
    if (!validate()) return
    onSave(name.trim(), expression.trim())
    onClose()
  }, [validate, name, expression, onSave, onClose])

  if (!open) return null

  // Available fields for reference
  const availableFields = group?.fields.filter(
    (f) => !f.computed && f.id !== editingFieldId,
  ) ?? []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border rounded-lg shadow-lg w-full max-w-lg mx-4">
        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b">
          <FunctionSquare className="w-4 h-4 text-orange-500" />
          <h3 className="text-sm font-medium">
            {isEditing ? '計算フィールドを編集' : '計算フィールドを追加'}
          </h3>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground text-lg leading-none"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Field name */}
          <div>
            <label className="block text-xs font-medium mb-1">フィールド名</label>
            <input
              className="w-full border rounded px-2 py-1.5 text-sm bg-background"
              placeholder="net_amount_calc"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isEditing}
            />
          </div>

          {/* Expression */}
          <div>
            <label className="block text-xs font-medium mb-1">計算式 (JEXL)</label>
            <textarea
              className="w-full border rounded px-2 py-1.5 text-sm font-mono bg-background min-h-[80px] resize-y"
              placeholder="price * qty * 1.1"
              value={expression}
              onChange={(e) => setExpression(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  handleSave()
                }
              }}
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Ctrl+Enter で保存
            </p>
          </div>

          {/* Available fields reference */}
          {availableFields.length > 0 && (
            <div>
              <p className="text-[10px] font-medium text-muted-foreground mb-1">
                利用可能なフィールド:
              </p>
              <div className="flex flex-wrap gap-1">
                {availableFields.map((f) => (
                  <button
                    key={f.id}
                    className="text-[10px] px-1.5 py-0.5 bg-muted rounded hover:bg-muted/80 font-mono"
                    onClick={() => {
                      setExpression((prev) => prev + f.key)
                    }}
                  >
                    {f.key}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-1.5 text-xs text-destructive">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t">
          <button
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            キャンセル
          </button>
          <button
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            onClick={handleSave}
          >
            {isEditing ? '更新' : '追加'}
          </button>
        </div>
      </div>
    </div>
  )
})
