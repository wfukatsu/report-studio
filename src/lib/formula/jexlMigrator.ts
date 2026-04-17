/**
 * Token-level JEXL → formula-v1 expression migrator.
 *
 * Walks the expression character-by-character, identifies function call tokens,
 * and rewrites only those tokens. String literals and field references are preserved.
 *
 * Used by migration.ts to auto-convert templates on import.
 */

import { JEXL_TO_FORMULA_MAP } from './functionCatalog'

export interface MigrationWarning {
  readonly kind: 'unmigrable_syntax' | 'manual_review'
  readonly detail: string
  readonly position: number
}

export interface MigrationResult {
  readonly formula: string
  readonly warnings: readonly MigrationWarning[]
  readonly hasUnmigrable: boolean
}

/** Named formatNumber pattern → TEXT format mask */
const FORMAT_NUMBER_PATTERNS: Record<string, string> = {
  integer: '#,##0',
  decimal2: '#,##0.00',
}

/**
 * Migrate a single JEXL expression string to formula-v1 format.
 * Returns the migrated formula and any warnings.
 */
export function migrateJexlExpression(jexl: string): MigrationResult {
  const warnings: MigrationWarning[] = []
  let out = ''
  let i = 0
  const src = jexl

  while (i < src.length) {
    const ch = src[i]

    // Double-quoted string → single-quoted
    if (ch === '"') {
      const result = consumeDoubleQuotedString(src, i)
      out += `'${result.text.replaceAll("'", "\\'")}'`
      i = result.end
      continue
    }

    // Skip single-quoted strings without modification
    if (ch === "'") {
      const start = i
      i++ // skip opening '
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\' && i + 1 < src.length) i++ // skip escape
        i++
      }
      if (i < src.length) i++ // skip closing '
      out += src.slice(start, i)
      continue
    }

    // Ternary operator ?: — unmigrable
    if (ch === '?') {
      warnings.push({
        kind: 'unmigrable_syntax',
        detail: '三項演算子 ?: は formula-v1 でサポートされていません。IF() に変換してください。',
        position: i,
      })
      out += ch
      i++
      continue
    }

    // Pipe operator | — unmigrable
    if (ch === '|') {
      warnings.push({
        kind: 'unmigrable_syntax',
        detail: 'パイプ演算子 | は formula-v1 でサポートされていません。',
        position: i,
      })
      out += ch
      i++
      continue
    }

    // Double-equals == → single =
    if (ch === '=' && i + 1 < src.length && src[i + 1] === '=') {
      out += '='
      i += 2
      continue
    }

    // Identifier or function name
    if (isIdentStart(ch)) {
      const identEnd = consumeIdentEnd(src, i)
      const name = src.slice(i, identEnd)
      const afterIdent = skipWhitespace(src, identEnd)
      const isCall = afterIdent < src.length && src[afterIdent] === '('
      const mappedFn = JEXL_TO_FORMULA_MAP.get(name)

      if (isCall && mappedFn) {
        // Special: formatNumber → TEXT with pattern translation
        if (name === 'formatNumber') {
          const argResult = consumeArgList(src, afterIdent)
          out += translateFormatNumber(argResult.args, warnings, i)
          i = argResult.end
          continue
        }
        // Special: formatDate → FORMAT_DATE (inject default format if missing)
        if (name === 'formatDate') {
          const argResult = consumeArgList(src, afterIdent)
          if (argResult.args.length === 1) {
            out += `FORMAT_DATE(${migrateJexlExpression(argResult.args[0]).formula}, 'yyyy/MM/dd')`
          } else {
            const migratedArgs = argResult.args.map((a) => migrateJexlExpression(a).formula)
            out += `FORMAT_DATE(${migratedArgs.join(', ')})`
          }
          i = argResult.end
          continue
        }
        // Standard function rename
        const argResult = consumeArgList(src, afterIdent)
        const migratedArgs = argResult.args.map((a) => migrateJexlExpression(a).formula)
        out += `${mappedFn}(${migratedArgs.join(', ')})`
        i = argResult.end
        continue
      }

      // Plain identifier — emit as-is
      out += name
      i = identEnd
      continue
    }

    // Default: pass through
    out += ch
    i++
  }

  return {
    formula: out,
    warnings,
    hasUnmigrable: warnings.some((w) => w.kind === 'unmigrable_syntax'),
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function isIdentStart(ch: string): boolean {
  return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_'
}

function isIdentPart(ch: string): boolean {
  return isIdentStart(ch) || (ch >= '0' && ch <= '9')
}

function consumeIdentEnd(src: string, start: number): number {
  let i = start
  while (i < src.length && isIdentPart(src[i])) i++
  return i
}

function skipWhitespace(src: string, i: number): number {
  while (i < src.length && (src[i] === ' ' || src[i] === '\t')) i++
  return i
}

function consumeDoubleQuotedString(
  src: string,
  start: number,
): { text: string; end: number } {
  let i = start + 1
  let text = ''
  while (i < src.length && src[i] !== '"') {
    if (src[i] === '\\' && i + 1 < src.length) { text += src[i + 1]; i += 2; continue }
    text += src[i]
    i++
  }
  return { text, end: i + 1 } // +1 to skip closing "
}

function consumeArgList(src: string, openParen: number): { args: string[]; end: number } {
  let i = openParen + 1
  let depth = 1
  const args: string[] = []
  let argStart = i

  while (i < src.length && depth > 0) {
    const ch = src[i]
    if (ch === '(') { depth++; i++; continue }
    if (ch === ')') {
      depth--
      if (depth === 0) {
        const arg = src.slice(argStart, i).trim()
        if (arg.length > 0) args.push(arg)
        i++
        break
      }
      i++; continue
    }
    if (ch === ',' && depth === 1) {
      args.push(src.slice(argStart, i).trim())
      i++
      argStart = i
      continue
    }
    // Skip string literals
    if (ch === '"' || ch === "'") {
      const quote = ch
      i++
      while (i < src.length && src[i] !== quote) {
        if (src[i] === '\\') i++
        i++
      }
      if (i < src.length) i++
      continue
    }
    i++
  }
  return { args, end: i }
}

function translateFormatNumber(
  args: string[],
  warnings: MigrationWarning[],
  position: number,
): string {
  if (args.length === 0) return 'TEXT()'
  const valueArg = migrateJexlExpression(args[0]).formula
  if (args.length === 1) {
    return `TEXT(${valueArg}, '#,##0')`
  }
  const rawPattern = args[1].trim().replace(/^["']|["']$/g, '')
  const mapped = FORMAT_NUMBER_PATTERNS[rawPattern]
  if (mapped) {
    return `TEXT(${valueArg}, '${mapped}')`
  }
  warnings.push({
    kind: 'manual_review',
    detail: `formatNumber パターン '${rawPattern}' は formula-v1 に自動変換できません。`,
    position,
  })
  return `TEXT(${valueArg}, '${rawPattern}')`
}
