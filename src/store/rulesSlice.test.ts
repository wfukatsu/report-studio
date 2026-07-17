import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore } from './index'
import type { CalculationRule, ValidationRule } from '@/types'

beforeEach(() => {
  useReportStore.getState().newReport()
})

function getCalcRules(): CalculationRule[] {
  return useReportStore.getState().definition.calculationRules
}

function getValRules(): ValidationRule[] {
  return useReportStore.getState().definition.validationRules
}

// ---------------------------------------------------------------------------
// CalculationRule
// ---------------------------------------------------------------------------

const BASE_RULE: CalculationRule = { id: 'id-1', key: 'total', expression: 'a + b', label: '合計', resultType: 'number', onError: 'zero' }

describe('addCalculationRule', () => {
  it('ルールを追加できる', () => {
    useReportStore.getState().addCalculationRule(BASE_RULE)
    expect(getCalcRules()).toHaveLength(1)
    expect(getCalcRules()[0].key).toBe('total')
  })

  it('複数追加できる', () => {
    useReportStore.getState().addCalculationRule({ ...BASE_RULE, id: 'id-1', key: 'r1', expression: '1' })
    useReportStore.getState().addCalculationRule({ ...BASE_RULE, id: 'id-2', key: 'r2', expression: '2' })
    expect(getCalcRules()).toHaveLength(2)
  })

  it('id フィールドが保持される', () => {
    useReportStore.getState().addCalculationRule(BASE_RULE)
    expect(getCalcRules()[0].id).toBe('id-1')
  })
})

describe('updateCalculationRule', () => {
  it('key が一致するルールを更新する', () => {
    useReportStore.getState().addCalculationRule({ ...BASE_RULE, expression: 'a' })
    useReportStore.getState().updateCalculationRule('total', { expression: 'a + b' })
    expect(getCalcRules()[0].expression).toBe('a + b')
  })

  it('存在しない key は無視する', () => {
    useReportStore.getState().addCalculationRule({ ...BASE_RULE, expression: 'a' })
    useReportStore.getState().updateCalculationRule('nonexistent', { expression: 'x' })
    expect(getCalcRules()[0].expression).toBe('a')
  })
})

describe('removeCalculationRule', () => {
  it('key が一致するルールを削除する', () => {
    useReportStore.getState().addCalculationRule({ ...BASE_RULE, id: 'id-1', key: 'r1', expression: '1' })
    useReportStore.getState().addCalculationRule({ ...BASE_RULE, id: 'id-2', key: 'r2', expression: '2' })
    useReportStore.getState().removeCalculationRule('r1')
    expect(getCalcRules()).toHaveLength(1)
    expect(getCalcRules()[0].key).toBe('r2')
  })

  it('存在しない key は無視する', () => {
    useReportStore.getState().addCalculationRule({ ...BASE_RULE, id: 'id-1', key: 'r1', expression: '1' })
    useReportStore.getState().removeCalculationRule('nonexistent')
    expect(getCalcRules()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// ValidationRule
// ---------------------------------------------------------------------------

describe('addValidationRule', () => {
  it('バリデーションルールを追加できる', () => {
    const rule: ValidationRule = { id: 'v1', condition: 'x > 0', message: 'err', severity: 'error' }
    useReportStore.getState().addValidationRule(rule)
    expect(getValRules()).toHaveLength(1)
    expect(getValRules()[0].id).toBe('v1')
  })
})

describe('updateValidationRule', () => {
  it('id が一致するルールを更新する', () => {
    useReportStore.getState().addValidationRule({ id: 'v1', condition: 'x', message: '', severity: 'error' })
    useReportStore.getState().updateValidationRule('v1', { message: '更新メッセージ' })
    expect(getValRules()[0].message).toBe('更新メッセージ')
  })

  it('存在しない id は無視する', () => {
    useReportStore.getState().addValidationRule({ id: 'v1', condition: 'x', message: 'orig', severity: 'error' })
    useReportStore.getState().updateValidationRule('v99', { message: '変更' })
    expect(getValRules()[0].message).toBe('orig')
  })
})

describe('removeValidationRule', () => {
  it('id が一致するルールを削除する', () => {
    useReportStore.getState().addValidationRule({ id: 'v1', condition: 'x', message: '', severity: 'error' })
    useReportStore.getState().addValidationRule({ id: 'v2', condition: 'y', message: '', severity: 'warning' })
    useReportStore.getState().removeValidationRule('v1')
    expect(getValRules()).toHaveLength(1)
    expect(getValRules()[0].id).toBe('v2')
  })
})
