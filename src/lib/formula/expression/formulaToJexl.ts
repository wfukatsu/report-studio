/**
 * Translate a formula-v1 expression string to JEXL format for client-side preview.
 *
 * This is the frontend equivalent of ExpressionEngine.translateFormulaToJexl()
 * on the server. Both use the same mapping table.
 *
 * Used by:
 * - FormulaLinter for preview evaluation via evaluateExpression()
 * - CalculationTab test button
 */

import { FORMULA_TO_JEXL_MAP } from '../functionCatalog'

/**
 * Convert formula-v1 function calls to JEXL equivalents.
 * e.g., "SUM(price * qty)" → "sum(price * qty)"
 *       "IF(x > 0, 'yes', 'no')" → "ifExpr(x > 0, 'yes', 'no')"
 */
export function formulaToJexl(formula: string): string {
  let result = formula
  for (const [formulaName, jexlName] of FORMULA_TO_JEXL_MAP) {
    // Replace "FUNCNAME(" with "jexlName(" — case-sensitive
    result = result.replaceAll(`${formulaName}(`, `${jexlName}(`)
  }
  return result
}
