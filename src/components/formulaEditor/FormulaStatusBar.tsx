/**
 * Status bar showing formula validation state, inferred type, preview value, and char count.
 *
 * Race #1 fix: Uses EditorView.updateListener (via onValidationChange callback)
 * instead of setInterval polling to read validation state from CodeMirror.
 */

import type { FormulaValidationState } from '@/lib/formula/editor/formulaLinter'
import type { SchemaFieldType } from '@/types'

const TYPE_LABELS: Readonly<Record<SchemaFieldType, string>> = {
  string: '文字列',
  number: '数値',
  date: '日付',
  boolean: '真偽値',
  array: '配列',
  image: '画像',
}

const TYPE_COLORS: Readonly<Record<SchemaFieldType, string>> = {
  string: 'bg-blue-100 text-blue-700',
  number: 'bg-green-100 text-green-700',
  date: 'bg-yellow-100 text-yellow-700',
  boolean: 'bg-slate-100 text-slate-600',
  array: 'bg-purple-100 text-purple-700',
  image: 'bg-pink-100 text-pink-700',
}

const EMPTY_STATE: FormulaValidationState = {
  diagnostics: [],
  resultType: null,
  previewValue: null,
  hasErrors: false,
  charCount: 0,
}

interface FormulaStatusBarProps {
  readonly validationState?: FormulaValidationState
}

export function FormulaStatusBar({ validationState }: FormulaStatusBarProps) {
  const state = validationState ?? EMPTY_STATE

  const errorCount = state.diagnostics.filter((d) => d.severity === 'error').length
  const warningCount = state.diagnostics.filter((d) => d.severity === 'warning').length

  return (
    <div
      className="flex items-center gap-2 px-2 py-1 text-[11px] text-slate-500 border-t border-slate-100 min-h-[28px]"
      role="status"
      aria-live="polite"
    >
      {/* Validation status */}
      <span className={state.hasErrors ? 'text-red-700 font-medium' : 'text-green-600 font-medium'}>
        {state.charCount === 0
          ? ''
          : state.hasErrors
            ? `✗ エラー(${errorCount}件)`
            : warningCount > 0
              ? `⚠ 警告(${warningCount}件)`
              : '✓ 有効'}
      </span>

      {/* Result type badge */}
      {state.resultType && (
        <span className={`px-1.5 py-px rounded text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[state.resultType] ?? ''}`}>
          {TYPE_LABELS[state.resultType] ?? state.resultType}
        </span>
      )}

      {/* Preview value */}
      {state.previewValue != null && (
        <span className="text-slate-700">
          プレビュー: <strong className="font-mono">{String(state.previewValue).slice(0, 200)}</strong>
        </span>
      )}

      {/* Spacer */}
      <span className="flex-1" />

      {/* Character count — show when approaching limit */}
      {state.charCount > 400 && (
        <span className={`font-mono ${state.charCount > 450 ? 'text-yellow-600 font-medium' : 'text-slate-500'}`}>
          {state.charCount}/500
        </span>
      )}
    </div>
  )
}
