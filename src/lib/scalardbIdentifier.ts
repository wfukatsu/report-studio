/**
 * ScalarDB identifier validation utilities.
 *
 * Shared by CreateTableForm (client-side inline feedback) and
 * createScalarDbTable (early rejection before POST). The Java backend
 * duplicates this regex in ScalarDbTableController with a matching test
 * to prevent drift.
 *
 * Rule: ASCII letters, digits, underscores; must start with a letter or
 * underscore. This is stricter than SQL (which permits quoted identifiers
 * with any characters) but aligns with ScalarDB's column-name requirements
 * and prevents cross-database quoting surprises.
 */

import { MAX_IDENTIFIER_LENGTH } from './scalardbLimits'

export const SCALARDB_IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * Validate a ScalarDB identifier (namespace, table name, or column name).
 *
 * Returns a discriminated union so callers can narrow without the
 * `!result` footgun:
 *
 * ```ts
 * const v = validateScalarDbIdentifier(name)
 * if (!v.valid) { console.error(v.error) }
 * ```
 */
export function validateScalarDbIdentifier(
  value: string,
): { valid: true } | { valid: false; error: string } {
  if (value === '') {
    return { valid: false, error: '識別子が空です' }
  }
  if (value.length > MAX_IDENTIFIER_LENGTH) {
    return {
      valid: false,
      error: `識別子が長すぎます (最大 ${MAX_IDENTIFIER_LENGTH} 文字): "${value.slice(0, 20)}..."`,
    }
  }
  if (!SCALARDB_IDENTIFIER_REGEX.test(value)) {
    return {
      valid: false,
      error: `識別子が不正です: "${value}" (英字・数字・アンダースコアのみ、先頭は英字またはアンダースコア)`,
    }
  }
  return { valid: true }
}
