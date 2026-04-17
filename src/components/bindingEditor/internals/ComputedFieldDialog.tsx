/**
 * ComputedFieldDialog — Modal for creating/editing computed (formula) fields.
 *
 * Integrates the CodeMirror 6 FormulaEditor with FieldTreePanel, FormulaToolbar,
 * and FormulaStatusBar for a rich formula editing experience.
 *
 * Race #4 fix: tooltipParent managed via useState (not ref).
 * SEC-04: Save blocked when formula has parse errors.
 */

import { memo, lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FunctionSquare, AlertCircle } from 'lucide-react'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { autocompletion } from '@codemirror/autocomplete'
import type { SchemaGroup } from '@/types'
import type { UseFormulaEditorReturn } from '@/components/formulaEditor/useFormulaEditor'
import { FieldTreePanel } from '@/components/formulaEditor/FieldTreePanel'
import { FormulaToolbar } from '@/components/formulaEditor/FormulaToolbar'
import { FormulaStatusBar } from '@/components/formulaEditor/FormulaStatusBar'
import {
  createFieldChipPlugin,
  buildFieldIndex,
  calltips,
  createFormulaCompletionSource,
  createFormulaLinter,
  formulaValidationField,
  setValidation,
} from '@/lib/formula/editor'
import type { FormulaValidationState } from '@/lib/formula/editor'

const FormulaEditor = lazy(() => import('@/components/formulaEditor/FormulaEditor'))

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
  const [validationState, setValidationState] = useState<FormulaValidationState | undefined>()
  // Race #4: tooltipParent via useState (not ref) to ensure re-render after mount
  const [dialogNode, setDialogNode] = useState<HTMLDivElement | null>(null)
  const editorRef = useRef<UseFormulaEditorReturn | null>(null)

  const group = groups.find((g) => g.id === groupId)
  const isEditing = editingFieldId != null

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setName(initialName ?? '')
      setExpression(initialExpression ?? '')
      setError(null)
      setValidationState(undefined)
    }
  }, [open, initialName, initialExpression])

  // Build CM6 dynamic extensions — memoized to prevent unnecessary reconfigurations
  const dynamicExtensions = useMemo((): Extension[] => {
    // Filter groups to same-group fields only (excluding computed fields being edited)
    const contextGroups = group ? [group] : []
    const fieldIndex = buildFieldIndex(contextGroups)

    return [
      createFieldChipPlugin(fieldIndex),
      calltips(),
      autocompletion({
        override: [createFormulaCompletionSource(contextGroups)],
        activateOnTyping: true,
        maxRenderedOptions: 50,
      }),
      createFormulaLinter(),
      // Listen for validation state changes (Race #1 fix: updateListener instead of polling)
      EditorView.updateListener.of((update) => {
        for (const tr of update.transactions) {
          for (const effect of tr.effects) {
            if (effect.is(setValidation)) {
              setValidationState(effect.value)
            }
          }
        }
      }),
    ]
  }, [group])

  const handleInsert = useCallback((text: string) => {
    editorRef.current?.insertAtCursor(text)
  }, [])

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
    // SEC-04: Block save when formula has parse errors
    if (validationState?.hasErrors) {
      setError('計算式にエラーがあります。修正してから保存してください')
      return false
    }
    setError(null)
    return true
  }, [name, expression, group, editingFieldId, validationState])

  const handleSave = useCallback(() => {
    if (!validate()) return
    onSave(name.trim(), expression.trim())
    onClose()
  }, [validate, name, expression, onSave, onClose])

  if (!open) return null

  const contextGroups = group ? [group] : []

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div
        ref={setDialogNode}
        className="bg-background border rounded-lg shadow-lg w-full max-w-[780px] mx-4"
      >
        {/* Header */}
        <div className="flex items-center gap-2 px-3 py-2 border-b">
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

        {/* Body — 2 column layout */}
        <div className="flex" style={{ minHeight: 240 }}>
          {/* Left: Field tree panel */}
          <FieldTreePanel groups={contextGroups} onInsert={handleInsert} />

          {/* Right: Name + Editor + Toolbar + StatusBar */}
          <div className="flex-1 flex flex-col p-3 gap-2">
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

            {/* Expression editor */}
            <div>
              <label className="block text-xs font-medium mb-1">計算式</label>
              <Suspense
                fallback={
                  <div className="border rounded-lg p-3 text-xs text-muted-foreground font-mono min-h-[48px]">
                    エディタを読み込み中...
                  </div>
                }
              >
                <div
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault()
                      handleSave()
                    }
                  }}
                >
                  <FormulaEditor
                    initialValue={initialExpression ?? ''}
                    tooltipParent={dialogNode}
                    dynamicExtensions={dynamicExtensions}
                    onChange={setExpression}
                    editorRef={editorRef}
                  />
                </div>
              </Suspense>

              {/* Toolbar */}
              <FormulaToolbar onInsertFunction={handleInsert} />

              {/* Status bar */}
              <FormulaStatusBar validationState={validationState} />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t">
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
