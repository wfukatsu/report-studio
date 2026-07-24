/**
 * #423: JEXL 式エンジンのクロス言語パリティテスト（フロント側）。
 *
 * schemas/expression-parity.json の共有 fixture を評価し、サーバ側
 * ExpressionParityTest.java と同一の期待値を検証する。エディタでのテスト実行
 * （このエンジン）と保存後のサーバ評価（Apache JEXL）の結果一致を守る。
 * ValueFormatter（フォーマット fixture ミラー）方式の式評価への横展開。
 */
import { describe, it, expect } from 'vitest'
import { evaluateExpression } from './jexlEngine'
import fixture from '../../schemas/expression-parity.json'

interface ParityCase {
  name: string
  expression: string
  context: Record<string, unknown>
  expected: unknown
}

const cases = fixture.cases as ParityCase[]

describe('JEXL 式パリティ (#423, schemas/expression-parity.json)', () => {
  it('fixture が空でない', () => {
    expect(cases.length).toBeGreaterThan(0)
  })

  it.each(cases.map((c) => [c.name, c] as const))('%s', async (_name, c) => {
    const actual = await evaluateExpression(c.expression, c.context)
    if (typeof c.expected === 'number') {
      expect(typeof actual).toBe('number')
      expect(actual as number).toBeCloseTo(c.expected, 9)
    } else {
      expect(actual).toEqual(c.expected)
    }
  })
})
