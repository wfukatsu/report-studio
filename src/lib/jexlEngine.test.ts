import { describe, it, expect, vi, afterEach } from 'vitest'
import { evaluateExpression, JEXL_BUILTINS } from './jexlEngine'

afterEach(() => {
  vi.useRealTimers()
})

describe('evaluateExpression — 基本評価', () => {
  it('数値比較が評価できる', async () => {
    expect(await evaluateExpression('x > 5', { x: 10 })).toBe(true)
    expect(await evaluateExpression('x > 5', { x: 3 })).toBe(false)
  })

  it('文字列比較が評価できる', async () => {
    expect(await evaluateExpression('name == "Alice"', { name: 'Alice' })).toBe(true)
    expect(await evaluateExpression('name == "Alice"', { name: 'Bob' })).toBe(false)
  })

  it('算術式が評価できる', async () => {
    expect(await evaluateExpression('a + b', { a: 3, b: 4 })).toBe(7)
  })

  it('ブール式が評価できる', async () => {
    expect(await evaluateExpression('true && false', {})).toBe(false)
    expect(await evaluateExpression('true || false', {})).toBe(true)
  })

  it('コンテキストなしのリテラルが評価できる', async () => {
    expect(await evaluateExpression('42', {})).toBe(42)
    expect(await evaluateExpression('"hello"', {})).toBe('hello')
  })
})

describe('evaluateExpression — カスタム関数', () => {
  it('sum() — 数値配列を合計する', async () => {
    expect(await evaluateExpression('sum(nums)', { nums: [1, 2, 3] })).toBe(6)
  })

  it('sum() — 空配列は 0 を返す', async () => {
    expect(await evaluateExpression('sum(nums)', { nums: [] })).toBe(0)
  })

  it('sum() — 非配列は 0 を返す', async () => {
    expect(await evaluateExpression('sum(nums)', { nums: null })).toBe(0)
  })

  it('sum() — 非数値要素はスキップされる', async () => {
    expect(await evaluateExpression('sum(nums)', { nums: [1, 'x', 2] })).toBe(3)
  })

  it('count() — 配列長を返す', async () => {
    expect(await evaluateExpression('count(items)', { items: [1, 2, 3] })).toBe(3)
  })

  it('count() — 空配列は 0 を返す', async () => {
    expect(await evaluateExpression('count(items)', { items: [] })).toBe(0)
  })

  it('count() — 非配列は 0 を返す', async () => {
    expect(await evaluateExpression('count(items)', { items: 'str' })).toBe(0)
  })

  it('round() — 整数に丸める (デフォルト)', async () => {
    expect(await evaluateExpression('round(val)', { val: 3.6 })).toBe(4)
    expect(await evaluateExpression('round(val)', { val: 3.4 })).toBe(3)
  })

  it('round() — 小数点指定で丸める', async () => {
    expect(await evaluateExpression('round(val, 2)', { val: 3.14159 })).toBe(3.14)
  })

  it('round() — 非数値は null を返す', async () => {
    expect(await evaluateExpression('round(val)', { val: 'abc' })).toBe(null)
  })
})

describe('evaluateExpression — エラー処理', () => {
  it('不正な式はエラーをスローする', async () => {
    await expect(evaluateExpression('???', {})).rejects.toThrow()
  })
})

describe('evaluateExpression — タイムアウト', () => {
  it('通常の評価はタイムアウトせずに完了する', async () => {
    // 500ms以内に完了する通常の式はタイムアウトしない
    const result = await evaluateExpression('1 + 1', {})
    expect(result).toBe(2)
  })
})

describe('evaluateExpression — セキュリティガード', () => {
  it('constructor キーワードを含む式をブロックする', async () => {
    await expect(evaluateExpression('x.constructor', { x: {} })).rejects.toThrow('禁止されているキーワード')
  })

  it('__proto__ キーワードを含む式をブロックする', async () => {
    await expect(evaluateExpression('x.__proto__', { x: {} })).rejects.toThrow('禁止されているキーワード')
  })

  it('prototype キーワードを含む式をブロックする', async () => {
    await expect(evaluateExpression('Object.prototype', {})).rejects.toThrow('禁止されているキーワード')
  })

  it('500文字を超える式をブロックする', async () => {
    const long = 'a + '.repeat(130)
    await expect(evaluateExpression(long, {})).rejects.toThrow('長すぎます')
  })

  it('通常の式はブロックされない', async () => {
    await expect(evaluateExpression('price * quantity', { price: 100, quantity: 3 })).resolves.toBe(300)
  })
})

describe('JEXL_BUILTINS', () => {
  it('sum, count, round の3関数が登録されている', () => {
    const names = JEXL_BUILTINS.map((f) => f.name)
    expect(names).toContain('sum')
    expect(names).toContain('count')
    expect(names).toContain('round')
  })

  it('各関数に signature と description がある', () => {
    for (const fn of JEXL_BUILTINS) {
      expect(fn.signature).toBeTruthy()
      expect(fn.description).toBeTruthy()
    }
  })
})
