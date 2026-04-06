/**
 * Pre-flight validation runner.
 * Evaluates ValidationRule conditions with JEXL and returns all violations.
 */
import { evaluateExpression } from './jexlEngine'
import type { ValidationRule } from '@/types'
import type { ValidationViolation } from '@/store/types'

const CONCURRENCY_LIMIT = 16

/**
 * Run tasks with a concurrency limit to avoid event-loop bursts.
 * At 200 rules with limit 16, at most 16 JEXL parsers run simultaneously.
 */
async function runWithConcurrency<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length)
  let index = 0
  async function worker(): Promise<void> {
    while (index < tasks.length) {
      const i = index++
      results[i] = await tasks[i]()
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}

export interface ValidationResult {
  violations: ValidationViolation[]
  hasErrors: boolean
  hasWarnings: boolean
  evaluationErrors: Array<{ ruleId: string; error: string }>
}

/**
 * Evaluate all validation rules against the given context.
 * All rules are evaluated (no short-circuit on first failure).
 */
export async function runValidation(
  rules: ValidationRule[],
  context: Record<string, unknown>,
): Promise<ValidationResult> {
  const violations: ValidationViolation[] = []
  const evaluationErrors: Array<{ ruleId: string; error: string }> = []

  const errorIds = new Set(
    rules.filter((r) => r.severity === 'error').map((r) => r.id),
  )

  await runWithConcurrency(
    rules.map((rule) => async () => {
      if (!rule.condition.trim()) return
      try {
        const fired = Boolean(await evaluateExpression(rule.condition, context))
        if (fired) {
          violations.push({
            ruleKey: rule.id,
            message: rule.message || rule.condition,
          })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        evaluationErrors.push({ ruleId: rule.id, error: msg })
        if (errorIds.has(rule.id)) {
          // error-severity rule failed to evaluate → block export
          violations.push({
            ruleKey: rule.id,
            message: `バリデーションルールの評価に失敗しました: ${msg}`,
          })
        }
        // warning-severity evaluation errors are skipped silently
      }
    }),
    CONCURRENCY_LIMIT,
  )

  const hasErrors = violations.some((v) => errorIds.has(v.ruleKey))
  const hasWarnings = violations.some((v) => !errorIds.has(v.ruleKey))

  return { violations, hasErrors, hasWarnings, evaluationErrors }
}
