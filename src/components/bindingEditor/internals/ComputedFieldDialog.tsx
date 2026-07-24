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
import { useTranslation } from 'react-i18next'
import { FunctionSquare, AlertCircle } from 'lucide-react'
import type { Extension } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { autocompletion } from '@codemirror/autocomplete'
import type { SchemaGroup } from '@/types'
import { FORMULA_FUNCTIONS, type FunctionDef } from '@/lib/formula/functionCatalog'
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
  const { t } = useTranslation('components')
  const [name, setName] = useState(initialName ?? '')
  const [expression, setExpression] = useState(initialExpression ?? '')
  const [error, setError] = useState<string | null>(null)
  const [validationState, setValidationState] = useState<FormulaValidationState | undefined>()
  const [selectedFn, setSelectedFn] = useState<FunctionDef | null>(null)
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

  const handleSelectFunction = useCallback((name: string) => {
    const def = FORMULA_FUNCTIONS.find((f) => f.name === name) ?? null
    setSelectedFn(def)
  }, [])

  const validate = useCallback(() => {
    const trimmedName = name.trim()
    if (!trimmedName) {
      setError(t('bindingEditor.computedFieldDialog.errNameRequired'))
      return false
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]{0,63}$/.test(trimmedName)) {
      setError(t('bindingEditor.computedFieldDialog.errNameInvalid'))
      return false
    }
    if (group) {
      const duplicate = group.fields.find(
        (f) => f.key === trimmedName && f.id !== editingFieldId,
      )
      if (duplicate) {
        setError(t('bindingEditor.computedFieldDialog.errNameDuplicate', { name: trimmedName }))
        return false
      }
    }
    if (!expression.trim()) {
      setError(t('bindingEditor.computedFieldDialog.errFormulaRequired'))
      return false
    }
    // SEC-04: Block save when formula has parse errors
    if (validationState?.hasErrors) {
      setError(t('bindingEditor.computedFieldDialog.errFormulaHasErrors'))
      return false
    }
    setError(null)
    return true
  }, [name, expression, group, editingFieldId, validationState, t])

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
            {isEditing ? t('bindingEditor.computedFieldDialog.editTitle') : t('bindingEditor.computedFieldDialog.addTitle')}
          </h3>
          <button
            className="ml-auto text-muted-foreground hover:text-foreground text-lg leading-none"
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {/* Body — 2 column: left=field/function list, right=inputs+help */}
        <div className="flex" style={{ height: 420 }}>
          {/* Left: Field tree panel */}
          <FieldTreePanel groups={contextGroups} onInsert={handleInsert} onSelectFunction={handleSelectFunction} />

          {/* Right: field name, formula, message, help */}
          <div className="flex-1 flex flex-col p-3 gap-2 overflow-y-auto">
            {/* フィールド名 */}
            <div>
              <label className="block text-xs font-medium mb-1">{t('bindingEditor.computedFieldDialog.fieldNameLabel')}</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm bg-background"
                placeholder="net_amount_calc"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isEditing}
              />
            </div>

            {/* 計算式 */}
            <div>
              <label className="block text-xs font-medium mb-1">{t('bindingEditor.computedFieldDialog.formulaLabel')}</label>
              <Suspense
                fallback={
                  <div className="border rounded-lg p-3 text-xs text-muted-foreground font-mono min-h-[48px]">
                    {t('bindingEditor.computedFieldDialog.editorLoading')}
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
              <FormulaToolbar onInsertFunction={handleInsert} />
              <FormulaStatusBar validationState={validationState} />
            </div>

            {/* メッセージ（エラー） */}
            {error && (
              <div className="flex items-center gap-1.5 text-xs text-destructive">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {error}
              </div>
            )}

            {/* ヘルプ */}
            <div className="flex-1 min-h-0">
              <label className="block text-xs font-medium mb-1">{t('bindingEditor.computedFieldDialog.helpLabel')}</label>
              <div className="border border-border rounded text-[11px] text-muted-foreground p-2 h-full overflow-y-auto space-y-1.5">
                {selectedFn ? (
                  <>
                    <p className="font-semibold text-foreground text-xs">
                      {selectedFn.name}({selectedFn.args.map((a) => a.optional ? `${a.name}?` : a.name).join(', ')})
                      <span className="ml-2 font-normal text-muted-foreground">{t(selectedFn.labelKey)}</span>
                    </p>
                    <p>{t(selectedFn.descriptionKey)}</p>
                    {selectedFn.args.length > 0 && (
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">{t('bindingEditor.computedFieldDialog.argsLabel')}</p>
                        {selectedFn.args.map((arg) => (
                          <p key={arg.name} className="pl-2">
                            <code className="font-mono text-[#6E5DCF]">{arg.name}</code>
                            <span className="text-muted-foreground"> ({arg.type})</span>
                            {' — '}{t(arg.descriptionKey)}
                            {arg.optional && <span className="text-muted-foreground">{t('bindingEditor.computedFieldDialog.optional')}</span>}
                          </p>
                        ))}
                      </div>
                    )}
                    <p><span className="font-medium text-foreground">{t('bindingEditor.computedFieldDialog.returnValueLabel')}</span> {selectedFn.returnType}</p>
                    {selectedFn.examples.length > 0 && (
                      <div className="space-y-0.5">
                        <p className="font-medium text-foreground">{t('bindingEditor.computedFieldDialog.examplesLabel')}</p>
                        {selectedFn.examples.map((ex, i) => (
                          <p key={i} className="pl-2 font-mono">
                            {ex.formula}{ex.result && <span className="text-muted-foreground"> → {ex.result}</span>}
                          </p>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <p>{t('bindingEditor.computedFieldDialog.helpEmpty')}</p>
                    <div className="space-y-0.5 mt-1">
                      {FORMULA_FUNCTIONS.map((fn) => (
                        <p key={fn.name}>
                          <strong>{fn.name}</strong>
                          <span className="text-muted-foreground"> — {t(fn.labelKey)}</span>
                        </p>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-3 py-2 border-t">
          <button
            className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
            onClick={onClose}
          >
            {t('bindingEditor.computedFieldDialog.cancel')}
          </button>
          <button
            className="px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded hover:opacity-90 transition-opacity"
            onClick={handleSave}
          >
            {isEditing ? t('bindingEditor.computedFieldDialog.update') : t('bindingEditor.computedFieldDialog.add')}
          </button>
        </div>
      </div>
    </div>
  )
})
