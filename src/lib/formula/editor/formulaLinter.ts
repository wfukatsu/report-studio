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

import i18n from '@/i18n/config'
import { StateField, StateEffect } from '@codemirror/state'
import { linter } from '@codemirror/lint'
import type { Diagnostic } from '@codemirror/lint'
import type { EditorView } from '@codemirror/view'
import { parse, ParseError } from '../expression'
import type { VisualExpression } from '../expression/types'
import { formulaToJexl } from '../expression/formulaToJexl'
import { evaluateExpression } from '@/lib/jexlEngine'
import type { SchemaFieldType } from '@/types'

/** Extract all field_ref paths from an AST (used for cycle detection) */
function extractFieldRefs(expr: VisualExpression): Set<string> {
  const refs = new Set<string>()
  function walk(node: VisualExpression): void {
    switch (node.type) {
      case 'field_ref':
        refs.add(node.path)
        break
      case 'function':
        for (const arg of node.args) walk(arg)
        break
      case 'binary_op':
      case 'comparison':
      case 'logical':
        walk(node.left)
        walk(node.right)
        break
      case 'literal':
        break
    }
  }
  walk(expr)
  return refs
}

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
 * @param options.previewContext - Optional context for preview evaluation (field values)
 * @param options.currentKey - Key of the current rule (for cycle detection)
 * @param options.peerRuleExpressions - Map of peer rule key → expression (for cycle detection)
 */
export function createFormulaLinter(options?: {
  readonly previewContext?: Record<string, unknown>
  readonly currentKey?: string
  readonly peerRuleExpressions?: ReadonlyMap<string, string>
}) {
  const previewContext = options?.previewContext
  const currentKey = options?.currentKey
  const peerRuleExpressions = options?.peerRuleExpressions
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
            message: i18n.t('serverErrors:lib.linterLengthExceeded', { max: MAX_FORMULA_LENGTH, current: charCount }),
          })
        } else if (charCount > CHAR_WARNING_THRESHOLD) {
          diagnostics.push({
            from: CHAR_WARNING_THRESHOLD,
            to: charCount,
            severity: 'warning',
            message: i18n.t('serverErrors:lib.linterLengthNearLimit', { current: charCount, max: MAX_FORMULA_LENGTH }),
          })
        }

        let resultType: SchemaFieldType | null = null
        // Sync dispatch always sends null — the async evaluate path dispatches the real value
        const previewValue: unknown = null

        try {
          const ast = parse(doc)

          // Cycle detection: check if this formula references a peer rule that references back
          if (currentKey && peerRuleExpressions && peerRuleExpressions.size > 0) {
            const refsInCurrent = extractFieldRefs(ast)
            for (const ref of refsInCurrent) {
              const peerExpr = peerRuleExpressions.get(ref)
              if (peerExpr) {
                try {
                  const peerAst = parse(peerExpr)
                  const peerRefs = extractFieldRefs(peerAst)
                  if (peerRefs.has(currentKey)) {
                    diagnostics.push({
                      from: 0,
                      to: doc.length,
                      severity: 'error',
                      message: i18n.t('serverErrors:lib.linterCircularReference', { from: currentKey, via: ref }),
                    })
                  }
                } catch {
                  // Peer parse failure — not our problem
                }
              }
            }
          }

          // Infer result type from AST (literal kinds are string/number/boolean — dates
          // only enter formulas via field references, never as literals)
          if (ast.type === 'literal') {
            resultType = ast.value.kind
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
          const message = err instanceof ParseError ? err.message : i18n.t('serverErrors:lib.linterSyntaxError')
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
