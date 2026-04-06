import { describe, it, expect } from 'vitest'
import { ValidateResponseSchema } from './evaluateResponse'

describe('ValidateResponseSchema — max constraints', () => {
  it('accepts valid violations', () => {
    const result = ValidateResponseSchema.safeParse({
      violations: [
        { ruleKey: 'required-check', message: '必須項目です', elementId: 'el-1' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects ruleKey longer than 100 characters', () => {
    const result = ValidateResponseSchema.safeParse({
      violations: [{ ruleKey: 'r'.repeat(101), message: 'msg' }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects message longer than 500 characters', () => {
    const result = ValidateResponseSchema.safeParse({
      violations: [{ ruleKey: 'rule', message: 'm'.repeat(501) }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects elementId longer than 100 characters', () => {
    const result = ValidateResponseSchema.safeParse({
      violations: [{ ruleKey: 'rule', message: 'msg', elementId: 'e'.repeat(101) }],
    })
    expect(result.success).toBe(false)
  })

  it('rejects violations array with more than 200 items', () => {
    const violations = Array.from({ length: 201 }, (_, i) => ({
      ruleKey: `rule-${i}`,
      message: 'msg',
    }))
    const result = ValidateResponseSchema.safeParse({ violations })
    expect(result.success).toBe(false)
  })

  it('accepts violations array with exactly 200 items', () => {
    const violations = Array.from({ length: 200 }, (_, i) => ({
      ruleKey: `rule-${i}`,
      message: 'msg',
    }))
    const result = ValidateResponseSchema.safeParse({ violations })
    expect(result.success).toBe(true)
  })
})
