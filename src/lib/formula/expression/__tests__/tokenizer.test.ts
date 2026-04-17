import { describe, it, expect } from 'vitest'
import { tokenize } from '../tokenizer'
import { ParseError } from '../errors'

describe('tokenizer', () => {
  it('tokenizes a simple arithmetic expression', () => {
    const tokens = tokenize('price * qty')
    expect(tokens.map((t) => t.kind)).toEqual(['IDENT', 'STAR', 'IDENT', 'EOF'])
  })

  it('tokenizes numbers with decimals', () => {
    const tokens = tokenize('1.5 + 2')
    expect(tokens[0]).toMatchObject({ kind: 'NUMBER', value: '1.5' })
  })

  it('tokenizes string literals', () => {
    const tokens = tokenize("'hello'")
    expect(tokens[0]).toMatchObject({ kind: 'STRING', value: 'hello' })
  })

  it('tokenizes comparison operators', () => {
    const tokens = tokenize('x >= 5')
    expect(tokens.map((t) => t.kind)).toEqual(['IDENT', 'GTE', 'NUMBER', 'EOF'])
  })

  it('tokenizes boolean literals', () => {
    const tokens = tokenize('TRUE AND false')
    expect(tokens.map((t) => t.kind)).toEqual(['BOOLEAN', 'AND', 'BOOLEAN', 'EOF'])
  })

  it('tokenizes function call', () => {
    const tokens = tokenize('SUM(items)')
    expect(tokens.map((t) => t.kind)).toEqual(['IDENT', 'LPAREN', 'IDENT', 'RPAREN', 'EOF'])
  })

  it('tokenizes field ref with dot', () => {
    const tokens = tokenize('order.total')
    expect(tokens.map((t) => t.kind)).toEqual(['IDENT', 'DOT', 'IDENT', 'EOF'])
  })

  it('tokenizes array access', () => {
    const tokens = tokenize('items[].price')
    expect(tokens.map((t) => t.kind)).toEqual(['IDENT', 'LBRACKET', 'RBRACKET', 'DOT', 'IDENT', 'EOF'])
  })

  // Security: SEC-03
  describe('forbidden identifiers', () => {
    it('rejects constructor', () => {
      expect(() => tokenize('constructor')).toThrow(ParseError)
    })

    it('rejects __proto__', () => {
      expect(() => tokenize('__proto__')).toThrow(ParseError)
    })

    it('rejects prototype', () => {
      expect(() => tokenize('prototype')).toThrow(ParseError)
    })

    it('rejects globalThis', () => {
      expect(() => tokenize('globalThis')).toThrow(ParseError)
    })

    it('rejects eval', () => {
      expect(() => tokenize('eval')).toThrow(ParseError)
    })

    it('rejects _prefixed identifiers', () => {
      expect(() => tokenize('_private')).toThrow(ParseError)
    })

    it('allows valid field names containing forbidden substrings', () => {
      // "subprocess_count" contains "process" but is not exactly "process"
      const tokens = tokenize('subprocess_count')
      expect(tokens[0]).toMatchObject({ kind: 'IDENT', value: 'subprocess_count' })
    })
  })

  it('rejects expressions exceeding max length', () => {
    const long = 'a + ' + 'b + '.repeat(200)
    expect(() => tokenize(long)).toThrow('長すぎます')
  })

  it('rejects unsafe characters in string literals', () => {
    expect(() => tokenize("'<script>'")).toThrow(ParseError)
  })

  it('handles escaped single quotes in strings', () => {
    const tokens = tokenize("'it\\'s'")
    expect(tokens[0]).toMatchObject({ kind: 'STRING', value: "it's" })
  })
})
