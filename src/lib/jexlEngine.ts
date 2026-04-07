/**
 * JEXL expression evaluation engine.
 *
 * Wraps @pawel-up/jexl with:
 * - V1-compatible custom functions: sum(), count(), round()
 * - 500ms evaluation timeout (mirrors V1 backend behavior)
 * - Prototype-escape keyword guard (blocks constructor/__proto__/prototype)
 *
 * Note: jexl.eval() is the JEXL library's own sandboxed expression evaluator,
 * not JavaScript's native eval(). It parses expressions into an AST and walks it
 * in an isolated context with no access to the JS runtime.
 */

import { Jexl } from '@pawel-up/jexl'

const jexl = new Jexl()

// ---------------------------------------------------------------------------
// Custom functions (V1 backend compatible)
// ---------------------------------------------------------------------------

/** sum(array) — returns 0 for empty/non-array */
jexl.addFunction('sum', (arr: unknown) => {
  if (!Array.isArray(arr)) return 0
  return arr.reduce<number>((acc, v) => acc + (typeof v === 'number' ? v : 0), 0)
})

/** count(array) — returns 0 for non-array */
jexl.addFunction('count', (arr: unknown) => {
  if (!Array.isArray(arr)) return 0
  return arr.length
})

/** round(value, decimalPlaces?) — returns null for non-finite inputs */
jexl.addFunction('round', (value: unknown, places: unknown) => {
  const n = typeof value === 'number' ? value : Number(value)
  if (!isFinite(n)) return null
  const p = typeof places === 'number' ? places : 0
  const factor = Math.pow(10, p)
  return Math.round(n * factor) / factor
})

// ---------------------------------------------------------------------------
// Built-in function registry (single source of truth for UI and agents)
// ---------------------------------------------------------------------------

/**
 * All functions registered in the JEXL sandbox.
 * Import this in CalculationTab and any agent context that needs to enumerate
 * available functions.
 */
export const JEXL_BUILTINS = [
  { name: 'sum',   signature: 'sum(array)',            description: '配列の合計値' },
  { name: 'count', signature: 'count(array)',           description: '配列の要素数' },
  { name: 'round', signature: 'round(value, places?)', description: '小数の丸め' },
] as const

// ---------------------------------------------------------------------------
// Security: prototype-escape keyword guard
// ---------------------------------------------------------------------------

/**
 * Keywords that can escape the JEXL sandbox via prototype chain traversal.
 * Blocked before the expression reaches the library.
 */
const JEXL_FORBIDDEN = /\b(constructor|__proto__|prototype)\b/

// ---------------------------------------------------------------------------
// Evaluation with timeout
// ---------------------------------------------------------------------------

const TIMEOUT_MS = 500

/**
 * Race a promise against a timeout, clearing the timer when the promise settles.
 * Without the .finally() clear, the timer would fire 500ms later as a no-op,
 * leaking timer objects especially during burst evaluation (e.g. 200 rules at once).
 */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timerId: ReturnType<typeof setTimeout>
  const timeoutP = new Promise<never>((_, reject) => {
    timerId = setTimeout(
      () => reject(new Error(`式の評価がタイムアウトしました (${ms}ms)`)),
      ms,
    )
  })
  return Promise.race([promise, timeoutP]).finally(() => clearTimeout(timerId))
}

/**
 * Evaluate a JEXL expression against the given context.
 * Throws on forbidden keywords, parse error, runtime error, or timeout.
 */
export async function evaluateExpression(
  expression: string,
  context: Record<string, unknown>,
): Promise<unknown> {
  if (expression.length > 500) {
    throw new Error('式が長すぎます (最大500文字)')
  }
  if (JEXL_FORBIDDEN.test(expression)) {
    throw new Error('式に禁止されているキーワードが含まれています')
  }
  // jexl.eval() is JEXL library's sandboxed evaluator, not JS native eval()
  return withTimeout(jexl.eval(expression, context), TIMEOUT_MS)
}

