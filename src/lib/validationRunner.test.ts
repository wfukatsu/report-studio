import { describe, it, expect } from 'vitest'
import { runValidation } from './validationRunner'
import type { ValidationRule } from '@/types'

function makeRule(overrides: Partial<ValidationRule> = {}): ValidationRule {
  return {
    id: 'r1',
    condition: 'x > 0',
    message: '違反',
    severity: 'error',
    ...overrides,
  }
}

describe('runValidation — 基本動作', () => {
  it('ルールなしは空の結果を返す', async () => {
    const result = await runValidation([], {})
    expect(result.violations).toHaveLength(0)
    expect(result.hasErrors).toBe(false)
    expect(result.hasWarnings).toBe(false)
    expect(result.evaluationErrors).toHaveLength(0)
  })

  it('条件が true のとき violation を追加する', async () => {
    const rules = [makeRule({ condition: 'x > 5' })]
    const result = await runValidation(rules, { x: 10 })
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].ruleKey).toBe('r1')
    expect(result.violations[0].message).toBe('違反')
  })

  it('条件が false のとき violation を追加しない', async () => {
    const rules = [makeRule({ condition: 'x > 5' })]
    const result = await runValidation(rules, { x: 3 })
    expect(result.violations).toHaveLength(0)
  })

  it('message が空のとき condition をメッセージとして使う', async () => {
    const rules = [makeRule({ condition: 'x > 5', message: '' })]
    const result = await runValidation(rules, { x: 10 })
    expect(result.violations[0].message).toBe('x > 5')
  })

  it('空の condition はスキップされる', async () => {
    const rules = [makeRule({ condition: '   ' })]
    const result = await runValidation(rules, {})
    expect(result.violations).toHaveLength(0)
  })
})

describe('runValidation — severity', () => {
  it('error severity の violation で hasErrors が true になる', async () => {
    const rules = [makeRule({ severity: 'error', condition: 'true' })]
    const result = await runValidation(rules, {})
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(false)
  })

  it('warning severity の violation で hasWarnings が true になる', async () => {
    const rules = [makeRule({ severity: 'warning', condition: 'true' })]
    const result = await runValidation(rules, {})
    expect(result.hasWarnings).toBe(true)
    expect(result.hasErrors).toBe(false)
  })

  it('error と warning が混在しても両方正しく判定される', async () => {
    const rules = [
      makeRule({ id: 'e1', severity: 'error', condition: 'true' }),
      makeRule({ id: 'w1', severity: 'warning', condition: 'true' }),
    ]
    const result = await runValidation(rules, {})
    expect(result.hasErrors).toBe(true)
    expect(result.hasWarnings).toBe(true)
  })
})

describe('runValidation — 評価エラー', () => {
  it('不正な式で evaluationErrors に記録される', async () => {
    const rules = [makeRule({ condition: '???invalid' })]
    const result = await runValidation(rules, {})
    expect(result.evaluationErrors).toHaveLength(1)
    expect(result.evaluationErrors[0].ruleId).toBe('r1')
  })

  it('error severity の評価エラーは violation も追加する', async () => {
    const rules = [makeRule({ severity: 'error', condition: '???invalid' })]
    const result = await runValidation(rules, {})
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].message).toMatch('バリデーションルールの評価に失敗しました')
  })

  it('warning severity の評価エラーは violation を追加しない', async () => {
    const rules = [makeRule({ severity: 'warning', condition: '???invalid' })]
    const result = await runValidation(rules, {})
    expect(result.violations).toHaveLength(0)
    expect(result.evaluationErrors).toHaveLength(1)
  })
})

describe('runValidation — 並行処理', () => {
  it('複数ルールをすべて評価する (短絡なし)', async () => {
    const rules = [
      makeRule({ id: 'r1', condition: 'a > 0' }),
      makeRule({ id: 'r2', condition: 'b > 0' }),
      makeRule({ id: 'r3', condition: 'c > 0' }),
    ]
    const result = await runValidation(rules, { a: 1, b: 2, c: 3 })
    expect(result.violations).toHaveLength(3)
  })
})
