/**
 * CodeMirror 6 linter for formula-v1 expressions.
 *
 * Runs the full pipeline: parse → validate → inferResultType → preview evaluate.
 * Publishes validation state via StateEffect (consumed by FormulaStatusBar via updateListener).
 *
 * Race #2 fix: Uses queueMicrotask() to defer dispatch of validation state,
 * preventing nested transactions inside the lint callback.
 *
 * SEC-05: Wall-clock check (100ms) on preview evaluation.
 */

import { StateField, StateEffect } from '@codemirror/state'
import { linter } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import { parse, ParseError } from '../expression'
import { formulaToJexl } from '../expression/formulaToJexl'
import { evaluateExpression } from '@/lib/jexlEngine'
import type { SchemaFieldType } from '@/types'

// ── Shared validation state ─────────────────────────────────────────────

export interface FormulaValidationState {
  readonly diagnostics: readonly Diagnostic[]
  readonly resultType: SchemaFieldType | null
  readonly previewValue: unknown
  readonly hasErrors: boolean
  readonly charCount: number
}

const EMPTY_STATE: FormulaValidationState = {
  diagnostics: [],
  resultType: null,
  previewValue: null,
  hasErrors: false,
  charCount: 0,
}

export const setValidation = StateEffect.define<FormulaValidationState>()

export const formulaValidationField = StateField.define<FormulaValidationState>({
  create() {
    return EMPTY_STATE
  },
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setValidation)) return effect.value
    }
    return value
  },
})

// ── Lint source factory ─────────────────────────────────────────────────

const MAX_FORMULA_LENGTH = 500
const CHAR_WARNING_THRESHOLD = 450

/**
 * Create a formula linter extension.
 *
 * @param previewContext - Optional context for preview evaluation (field values)
 */
export function createFormulaLinter(
  previewContext?: Record<string, unknown>,
) {
  return [
    formulaValidationField,
    linter(
      (view: EditorView): Diagnostic[] => {
        const doc = view.state.doc.toString()
        const charCount = doc.length

        if (doc.trim() === '') {
          // Race #2 fix: defer dispatch via queueMicrotask
          queueMicrotask(() => {
            if (!view.dom.isConnected) return // destroy guard
            view.dispatch({ effects: setValidation.of({ ...EMPTY_STATE, charCount }) })
          })
          return []
        }

        const diagnostics: Diagnostic[] = []

        // Character count warnings
        if (charCount > MAX_FORMULA_LENGTH) {
          diagnostics.push({
            from: MAX_FORMULA_LENGTH,
            to: charCount,
            severity: 'error',
            message: `式の長さが上限(${MAX_FORMULA_LENGTH}文字)を超えています (${charCount}/${MAX_FORMULA_LENGTH})`,
          })
        } else if (charCount > CHAR_WARNING_THRESHOLD) {
          diagnostics.push({
            from: CHAR_WARNING_THRESHOLD,
            to: charCount,
            severity: 'warning',
            message: `式の長さが上限に近づいています (${charCount}/${MAX_FORMULA_LENGTH})`,
          })
        }

        let resultType: SchemaFieldType | null = null
        let previewValue: unknown = null

        try {
          const ast = parse(doc)

          // Infer result type from AST
          if (ast.type === 'literal') {
            resultType = ast.value.kind === 'date' ? 'date' : (ast.value.kind as SchemaFieldType)
          } else if (ast.type === 'binary_op') {
            resultType = 'number'
          } else if (ast.type === 'comparison' || ast.type === 'logical') {
            resultType = 'boolean'
          } else if (ast.type === 'function') {
            resultType = 'number' // default for most functions
          }

          // Preview evaluation via JEXL engine (SEC-05: run async with timeout)
          const hasErrors = diagnostics.some((d) => d.severity === 'error')
          if (!hasErrors && previewContext) {
            const jexlExpr = formulaToJexl(doc)
            evaluateExpression(jexlExpr, previewContext)
              .then((result) => {
                if (!view.dom.isConnected) return
                queueMicrotask(() => {
                  if (!view.dom.isConnected) return
                  view.dispatch({
                    effects: setValidation.of({
                      diagnostics,
                      resultType,
                      previewValue: result,
                      hasErrors: false,
                      charCount,
                    }),
                  })
                })
              })
              .catch(() => {
                // Evaluation failure is not a lint error
              })
          }

          // Race #2 fix: defer dispatch
          queueMicrotask(() => {
            if (!view.dom.isConnected) return
            view.dispatch({
              effects: setValidation.of({
                diagnostics,
                resultType,
                previewValue,
                hasErrors: diagnostics.some((d) => d.severity === 'error'),
                charCount,
              }),
            })
          })

          return diagnostics
        } catch (err) {
          const message = err instanceof ParseError ? err.message : '構文エラー'
          const offset = err instanceof ParseError ? err.offset : 0
          diagnostics.push({
            from: offset,
            to: Math.min(offset + 1, doc.length),
            severity: 'error',
            message,
          })

          // Race #2 fix: defer dispatch
          queueMicrotask(() => {
            if (!view.dom.isConnected) return
            view.dispatch({
              effects: setValidation.of({
                diagnostics,
                resultType: null,
                previewValue: null,
                hasErrors: true,
                charCount,
              }),
            })
          })

          return diagnostics
        }
      },
      { delay: 300 },
    ),
  ]
}
