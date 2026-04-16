/**
 * Pratt parser for formula-v1 expressions.
 * Produces a VisualExpression AST used by the linter for validation and type inference.
 *
 * Security guards: MAX_AST_NODES=100, MAX_NESTING=10, MAX_ARGS=10 (SEC-02)
 */

import type { Token, TokenKind } from './tokens'
import type { VisualExpression, ArithmeticOp, ComparisonOp } from './types'
import { FORMULA_FUNCTION_NAMES } from '../functionCatalog'
import { ParseError } from './errors'
import { tokenize } from './tokenizer'

const MAX_AST_NODES = 100
const MAX_NESTING = 10
const MAX_ARGS = 10

// Pratt binding powers: [left, right] — left < right = left-associative
const INFIX_BP: Partial<Record<TokenKind, readonly [number, number]>> = {
  OR: [10, 11],
  AND: [20, 21],
  EQ: [40, 41], NEQ: [40, 41],
  LT: [50, 51], GT: [50, 51], LTE: [50, 51], GTE: [50, 51],
  PLUS: [60, 61], MINUS: [60, 61],
  STAR: [70, 71], SLASH: [70, 71],
}

const PREFIX_BP: Partial<Record<TokenKind, number>> = {
  MINUS: 90,
  NOT: 30,
}

const OP_MAP: Readonly<Record<string, ArithmeticOp | ComparisonOp>> = {
  PLUS: '+', MINUS: '-', STAR: '*', SLASH: '/',
  EQ: '=', NEQ: '!=', LT: '<', GT: '>', LTE: '<=', GTE: '>=',
}

const ARITHMETIC_OPS = new Set<string>(['+', '-', '*', '/'])

export function parse(source: string): VisualExpression {
  const tokens = tokenize(source)
  let pos = 0
  let nodeCount = 0
  let nestingDepth = 0

  function countNode(): void {
    nodeCount++
    if (nodeCount > MAX_AST_NODES) {
      throw error('式が複雑すぎます（ノード数上限超過）', current())
    }
  }

  function current(): Token {
    return tokens[pos]
  }

  function advance(): Token {
    const t = tokens[pos]
    pos++
    return t
  }

  function expect(kind: TokenKind): Token {
    const t = current()
    if (t.kind !== kind) {
      throw error(`'${kindLabel(kind)}' が必要ですが '${t.value || kindLabel(t.kind)}' がありました`, t)
    }
    return advance()
  }

  function error(message: string, token: Token): ParseError {
    return new ParseError(message, token.start, source)
  }

  function parseExpr(minBp: number): VisualExpression {
    nestingDepth++
    if (nestingDepth > MAX_NESTING) {
      throw error('ネストが深すぎます（上限10レベル）', current())
    }

    let left = parsePrefix()

    while (true) {
      const token = current()
      const bps = INFIX_BP[token.kind]
      if (!bps) break
      const [leftBp, rightBp] = bps
      if (leftBp < minBp) break

      advance()
      const right = parseExpr(rightBp)
      countNode()

      const op = OP_MAP[token.kind]
      if (op && ARITHMETIC_OPS.has(op)) {
        left = { type: 'binary_op', op: op as ArithmeticOp, left, right }
      } else if (op) {
        left = { type: 'comparison', op: op as ComparisonOp, left, right }
      } else if (token.kind === 'AND' || token.kind === 'OR') {
        left = { type: 'logical', op: token.kind, left, right }
      }
    }

    nestingDepth--
    return left
  }

  function parsePrefix(): VisualExpression {
    const token = current()

    const bp = PREFIX_BP[token.kind]
    if (bp !== undefined) {
      advance()
      const operand = parseExpr(bp)
      countNode()
      if (token.kind === 'MINUS') {
        return {
          type: 'binary_op',
          op: '*',
          left: { type: 'literal', value: { kind: 'number', value: -1 } },
          right: operand,
        }
      }
      // NOT: represent as comparison with boolean false
      return {
        type: 'comparison',
        op: '=',
        left: operand,
        right: { type: 'literal', value: { kind: 'boolean', value: false } },
      }
    }

    switch (token.kind) {
      case 'NUMBER': {
        advance()
        countNode()
        return { type: 'literal', value: { kind: 'number', value: parseFloat(token.value) } }
      }
      case 'STRING': {
        advance()
        countNode()
        return { type: 'literal', value: { kind: 'string', value: token.value } }
      }
      case 'BOOLEAN': {
        advance()
        countNode()
        return { type: 'literal', value: { kind: 'boolean', value: token.value.toLowerCase() === 'true' } }
      }
      case 'IDENT':
        return parseIdentExpr()
      case 'LPAREN':
        return parseGrouped()
      default:
        throw error(`予期しないトークン: '${token.value || kindLabel(token.kind)}'`, token)
    }
  }

  function parseIdentExpr(): VisualExpression {
    const name = advance()

    // Function call: NAME(args...)
    if (current().kind === 'LPAREN') {
      return parseFunctionCall(name)
    }

    // Field reference: group.field
    if (current().kind === 'DOT') {
      advance()
      const field = expect('IDENT')
      countNode()
      return { type: 'field_ref', path: `${name.value}.${field.value}` }
    }

    // Array field reference: group[].field
    if (current().kind === 'LBRACKET') {
      advance()
      expect('RBRACKET')
      expect('DOT')
      const field = expect('IDENT')
      countNode()
      return { type: 'field_ref', path: `${name.value}[].${field.value}` }
    }

    // Bare identifier: could be a computed field reference
    countNode()
    return { type: 'field_ref', path: name.value }
  }

  function parseFunctionCall(nameToken: Token): VisualExpression {
    const funcName = nameToken.value.toUpperCase()
    if (!FORMULA_FUNCTION_NAMES.has(funcName)) {
      throw error(`未知の関数: '${nameToken.value}'`, nameToken)
    }

    advance() // skip (
    const args: VisualExpression[] = []
    if (current().kind !== 'RPAREN') {
      args.push(parseExpr(0))
      while (current().kind === 'COMMA') {
        advance()
        if (args.length >= MAX_ARGS) {
          throw error(`関数の引数が多すぎます（上限${MAX_ARGS}個）`, current())
        }
        args.push(parseExpr(0))
      }
    }
    expect('RPAREN')
    countNode()
    return { type: 'function', name: funcName, args }
  }

  function parseGrouped(): VisualExpression {
    advance() // skip (
    const expr = parseExpr(0)
    expect('RPAREN')
    return expr
  }

  const result = parseExpr(0)
  if (current().kind !== 'EOF') {
    throw error(`式の末尾に余分なトークンがあります: '${current().value}'`, current())
  }
  return result
}

function kindLabel(kind: TokenKind): string {
  const labels: Record<string, string> = {
    RPAREN: ')', LPAREN: '(', RBRACKET: ']', LBRACKET: '[',
    COMMA: ',', DOT: '.', EOF: '式の末尾',
    IDENT: '識別子', NUMBER: '数値', STRING: '文字列',
  }
  return labels[kind] ?? kind
}
