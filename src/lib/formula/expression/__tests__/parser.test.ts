import { describe, it, expect } from 'vitest'
import { parse } from '../parser'

describe('parser', () => {
  it('parses a number literal', () => {
    const ast = parse('42')
    expect(ast).toEqual({ type: 'literal', value: { kind: 'number', value: 42 } })
  })

  it('parses a string literal', () => {
    const ast = parse("'hello'")
    expect(ast).toEqual({ type: 'literal', value: { kind: 'string', value: 'hello' } })
  })

  it('parses a boolean literal', () => {
    const ast = parse('true')
    expect(ast).toEqual({ type: 'literal', value: { kind: 'boolean', value: true } })
  })

  it('parses a field reference', () => {
    const ast = parse('price')
    expect(ast).toEqual({ type: 'field_ref', path: 'price' })
  })

  it('parses a dotted field reference', () => {
    const ast = parse('order.total')
    expect(ast).toEqual({ type: 'field_ref', path: 'order.total' })
  })

  it('parses an array field reference', () => {
    const ast = parse('items[].price')
    expect(ast).toEqual({ type: 'field_ref', path: 'items[].price' })
  })

  it('parses binary arithmetic', () => {
    const ast = parse('a + b')
    expect(ast.type).toBe('binary_op')
    if (ast.type === 'binary_op') {
      expect(ast.op).toBe('+')
    }
  })

  it('parses operator precedence correctly', () => {
    const ast = parse('a + b * c')
    expect(ast.type).toBe('binary_op')
    if (ast.type === 'binary_op') {
      expect(ast.op).toBe('+')
      expect(ast.right.type).toBe('binary_op')
    }
  })

  it('parses a function call', () => {
    const ast = parse('SUM(items)')
    expect(ast).toEqual({
      type: 'function',
      name: 'SUM',
      args: [{ type: 'field_ref', path: 'items' }],
    })
  })

  it('parses nested function calls', () => {
    const ast = parse('ROUND(SUM(items), 2)')
    expect(ast.type).toBe('function')
    if (ast.type === 'function') {
      expect(ast.name).toBe('ROUND')
      expect(ast.args[0].type).toBe('function')
    }
  })

  it('parses comparison', () => {
    const ast = parse('x > 5')
    expect(ast.type).toBe('comparison')
  })

  it('parses logical expressions', () => {
    const ast = parse('a AND b OR c')
    expect(ast.type).toBe('logical')
  })

  it('parses IF function', () => {
    const ast = parse("IF(score >= 60, 'pass', 'fail')")
    expect(ast.type).toBe('function')
    if (ast.type === 'function') {
      expect(ast.name).toBe('IF')
      expect(ast.args).toHaveLength(3)
    }
  })

  it('rejects unknown functions', () => {
    expect(() => parse('UNKNOWN(x)')).toThrow('未知の関数')
  })

  it('rejects deeply nested expressions (SEC-02)', () => {
    const deep = '(' .repeat(11) + '1' + ')'.repeat(11)
    expect(() => parse(deep)).toThrow('ネストが深すぎます')
  })

  it('rejects expressions with too many nodes (SEC-02)', () => {
    // 101 additions = 101+ nodes
    const expr = Array(102).fill('a').join(' + ')
    expect(() => parse(expr)).toThrow('複雑すぎます')
  })

  it('rejects trailing tokens', () => {
    expect(() => parse('a b')).toThrow('余分なトークン')
  })

  it('parses parenthesized expressions', () => {
    const ast = parse('(a + b) * c')
    expect(ast.type).toBe('binary_op')
    if (ast.type === 'binary_op') {
      expect(ast.op).toBe('*')
      expect(ast.left.type).toBe('binary_op')
    }
  })
})
