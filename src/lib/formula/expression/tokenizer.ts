/**
 * Hand-written tokenizer for the formula-v1 expression language.
 *
 * Security guards:
 * - MAX_FORMULA_LENGTH: 500 chars (matches server limit)
 * - FORBIDDEN_IDENTIFIERS: blocks prototype chain escapes + JS globals (SEC-03)
 * - UNSAFE_STRING_CHARS: blocks XSS vectors in string literals
 * - Underscore-prefix identifiers rejected (SEC-03)
 */

import i18n from '@/i18n/config'
import type { Token, TokenKind } from './tokens'
import { ParseError } from './errors'

const MAX_FORMULA_LENGTH = 500

const SINGLE_CHAR: Readonly<Record<string, TokenKind>> = {
  '+': 'PLUS', '-': 'MINUS', '*': 'STAR', '/': 'SLASH',
  '(': 'LPAREN', ')': 'RPAREN', ',': 'COMMA',
  '.': 'DOT', '[': 'LBRACKET', ']': 'RBRACKET',
}

/** Characters forbidden in string literals (XSS prevention) */
const UNSAFE_STRING_CHARS = new Set(['<', '>', '&', '"'])

/**
 * Identifiers that could escape the expression sandbox (SEC-03).
 * Blocked at tokenizer level as defense-in-depth.
 */
const FORBIDDEN_IDENTIFIERS = new Set([
  'constructor', '__proto__', 'prototype',
  'globalThis', 'window', 'global', 'process',
  'require', 'eval', 'Function',
  'setTimeout', 'setInterval', 'fetch',
  'XMLHttpRequest', 'importScripts',
  'class', 'import',
])

export function tokenize(source: string): readonly Token[] {
  if (source.length > MAX_FORMULA_LENGTH) {
    throw new ParseError(i18n.t('serverErrors:lib.tokenizerFormulaTooLong', { max: MAX_FORMULA_LENGTH }), 0, source)
  }

  const tokens: Token[] = []
  let pos = 0

  function peek(offset = 0): string {
    return source[pos + offset] ?? ''
  }

  function isDigit(ch: string): boolean {
    return ch >= '0' && ch <= '9'
  }

  function isIdentStart(ch: string): boolean {
    return (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z')
  }

  function isIdentPart(ch: string): boolean {
    return isIdentStart(ch) || isDigit(ch) || ch === '_'
  }

  function skipWhitespace(): void {
    while (pos < source.length && (source[pos] === ' ' || source[pos] === '\t' || source[pos] === '\n' || source[pos] === '\r')) {
      pos++
    }
  }

  function take(kind: TokenKind, len: number, start: number): Token {
    pos += len
    return { kind, value: source.slice(start, pos), start, end: pos }
  }

  function readNumber(start: number): Token {
    while (pos < source.length && isDigit(source[pos])) pos++
    if (pos < source.length && source[pos] === '.') {
      pos++
      while (pos < source.length && isDigit(source[pos])) pos++
    }
    return { kind: 'NUMBER', value: source.slice(start, pos), start, end: pos }
  }

  function readString(start: number): Token {
    pos++ // skip opening '
    let value = ''
    while (pos < source.length && source[pos] !== "'") {
      if (UNSAFE_STRING_CHARS.has(source[pos])) {
        throw new ParseError(i18n.t('serverErrors:lib.tokenizerUnsafeStringChar', { char: source[pos] }), pos, source)
      }
      if (source[pos] === '\\' && pos + 1 < source.length && source[pos + 1] === "'") {
        value += "'"
        pos += 2
        continue
      }
      value += source[pos]
      pos++
    }
    if (pos >= source.length) {
      throw new ParseError(i18n.t('serverErrors:lib.tokenizerUnterminatedString'), start, source)
    }
    pos++ // skip closing '
    return { kind: 'STRING', value, start, end: pos }
  }

  function readIdentifier(start: number): Token {
    while (pos < source.length && isIdentPart(source[pos])) pos++
    const value = source.slice(start, pos)

    // SEC-03: Reject identifiers starting with _
    if (value.startsWith('_')) {
      throw new ParseError(i18n.t('serverErrors:lib.tokenizerUnderscoreIdentifier'), start, source)
    }

    // SEC-03: Reject forbidden identifiers (prototype chain escapes + JS globals)
    if (FORBIDDEN_IDENTIFIERS.has(value)) {
      throw new ParseError(i18n.t('serverErrors:lib.tokenizerReservedKeyword', { name: value }), start, source)
    }

    const upper = value.toUpperCase()
    if (upper === 'TRUE' || upper === 'FALSE') return { kind: 'BOOLEAN', value, start, end: pos }
    if (upper === 'AND') return { kind: 'AND', value, start, end: pos }
    if (upper === 'OR') return { kind: 'OR', value, start, end: pos }
    if (upper === 'NOT') return { kind: 'NOT', value, start, end: pos }
    return { kind: 'IDENT', value, start, end: pos }
  }

  while (pos < source.length) {
    skipWhitespace()
    if (pos >= source.length) break

    const start = pos
    const ch = source[start]

    if (ch in SINGLE_CHAR) { tokens.push(take(SINGLE_CHAR[ch], 1, start)); continue }
    if (ch === '!' && peek(1) === '=') { tokens.push(take('NEQ', 2, start)); continue }
    if (ch === '<' && peek(1) === '=') { tokens.push(take('LTE', 2, start)); continue }
    if (ch === '<') { tokens.push(take('LT', 1, start)); continue }
    if (ch === '>' && peek(1) === '=') { tokens.push(take('GTE', 2, start)); continue }
    if (ch === '>') { tokens.push(take('GT', 1, start)); continue }
    if (ch === '=') { tokens.push(take('EQ', 1, start)); continue }
    if (isDigit(ch)) { tokens.push(readNumber(start)); continue }
    if (ch === "'") { tokens.push(readString(start)); continue }
    if (isIdentStart(ch)) { tokens.push(readIdentifier(start)); continue }

    throw new ParseError(i18n.t('serverErrors:lib.tokenizerUnexpectedChar', { char: ch }), start, source)
  }

  tokens.push({ kind: 'EOF', value: '', start: pos, end: pos })
  return tokens
}
