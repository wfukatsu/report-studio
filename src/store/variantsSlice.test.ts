import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore } from './index'
import type { OutputVariant, MaskingRule } from '@/types'

// ---------------------------------------------------------------------------
// Helper to get typed variants from store
// ---------------------------------------------------------------------------

function getVariants(): OutputVariant[] {
  return useReportStore.getState().definition.outputVariants as OutputVariant[]
}

/**
 * Distributive Omit over the MaskingRule union — plain `Omit<MaskingRule, 'id'>`
 * collapses the union to its common keys, dropping replaceValue/keepFirst/keepLast.
 */
type MaskingRuleInput = MaskingRule extends infer R
  ? R extends MaskingRule ? Omit<R, 'id'> : never
  : never

// ---------------------------------------------------------------------------
// Reset store between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useReportStore.getState().newReport()
})

// ---------------------------------------------------------------------------
// addVariant
// ---------------------------------------------------------------------------

describe('addVariant', () => {
  it('adds a variant with the given name', () => {
    useReportStore.getState().addVariant('External')
    const variants = getVariants()
    expect(variants).toHaveLength(1)
    expect(variants[0].name).toBe('External')
  })

  it('initializes hiddenElementIds and maskingRules as empty arrays', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    expect(v.hiddenElementIds).toEqual([])
    expect(v.maskingRules).toEqual([])
  })

  it('generates a unique id for each variant', () => {
    useReportStore.getState().addVariant('A')
    useReportStore.getState().addVariant('B')
    const [a, b] = getVariants()
    expect(a.id).not.toBe(b.id)
  })

  it('can add multiple variants', () => {
    useReportStore.getState().addVariant('A')
    useReportStore.getState().addVariant('B')
    useReportStore.getState().addVariant('C')
    expect(getVariants()).toHaveLength(3)
  })
})

// ---------------------------------------------------------------------------
// removeVariant
// ---------------------------------------------------------------------------

describe('removeVariant', () => {
  it('removes the variant with the given id', () => {
    useReportStore.getState().addVariant('keep')
    useReportStore.getState().addVariant('remove')
    const [keep, remove] = getVariants()
    useReportStore.getState().removeVariant(remove.id)
    expect(getVariants()).toHaveLength(1)
    expect(getVariants()[0].id).toBe(keep.id)
  })

  it('does nothing when id does not exist', () => {
    useReportStore.getState().addVariant('keep')
    useReportStore.getState().removeVariant('nonexistent')
    expect(getVariants()).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// updateVariant
// ---------------------------------------------------------------------------

describe('updateVariant', () => {
  it('updates the name of a variant', () => {
    useReportStore.getState().addVariant('old name')
    const [v] = getVariants()
    useReportStore.getState().updateVariant(v.id, { name: 'new name' })
    expect(getVariants()[0].name).toBe('new name')
  })

  it('updates targetAudience', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    useReportStore.getState().updateVariant(v.id, { targetAudience: 'External clients' })
    expect(getVariants()[0].targetAudience).toBe('External clients')
  })

  it('does nothing when id does not exist', () => {
    useReportStore.getState().addVariant('v1')
    useReportStore.getState().updateVariant('bad-id', { name: 'changed' })
    expect(getVariants()[0].name).toBe('v1')
  })
})

// ---------------------------------------------------------------------------
// toggleElementHidden
// ---------------------------------------------------------------------------

describe('toggleElementHidden', () => {
  it('adds elementId when not hidden', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    useReportStore.getState().toggleElementHidden(v.id, 'el-1')
    expect(getVariants()[0].hiddenElementIds).toContain('el-1')
  })

  it('removes elementId when already hidden', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    useReportStore.getState().toggleElementHidden(v.id, 'el-1')
    useReportStore.getState().toggleElementHidden(v.id, 'el-1')
    expect(getVariants()[0].hiddenElementIds).not.toContain('el-1')
  })

  it('does nothing when variant id does not exist', () => {
    useReportStore.getState().addVariant('v1')
    useReportStore.getState().toggleElementHidden('bad-id', 'el-1')
    expect(getVariants()[0].hiddenElementIds).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// addMaskingRule
// ---------------------------------------------------------------------------

describe('addMaskingRule', () => {
  it('adds a fullReplace masking rule', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    const rule: MaskingRuleInput = { targetElementId: 'el-1', type: 'fullReplace', replaceValue: '***' }
    useReportStore.getState().addMaskingRule(v.id, rule)
    const rules = getVariants()[0].maskingRules
    expect(rules).toHaveLength(1)
    expect(rules[0].targetElementId).toBe('el-1')
    expect(rules[0].type).toBe('fullReplace')
  })

  it('adds a partial masking rule', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    const rule: MaskingRuleInput = { targetElementId: 'el-2', type: 'partial', keepFirst: 2, keepLast: 4 }
    useReportStore.getState().addMaskingRule(v.id, rule)
    const rules = getVariants()[0].maskingRules
    expect(rules[0].type).toBe('partial')
    if (rules[0].type === 'partial') {
      expect(rules[0].keepFirst).toBe(2)
      expect(rules[0].keepLast).toBe(4)
    }
  })

  it('assigns a unique id to the new rule', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    const rule: MaskingRuleInput = { targetElementId: 'el-1', type: 'fullReplace', replaceValue: 'X' }
    useReportStore.getState().addMaskingRule(v.id, rule)
    useReportStore.getState().addMaskingRule(v.id, rule)
    const ids = getVariants()[0].maskingRules.map((r) => r.id)
    expect(ids[0]).not.toBe(ids[1])
  })
})

// ---------------------------------------------------------------------------
// removeMaskingRule
// ---------------------------------------------------------------------------

describe('removeMaskingRule', () => {
  it('removes the masking rule with the given id', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    const rule: MaskingRuleInput = { targetElementId: 'el-1', type: 'fullReplace', replaceValue: '***' }
    useReportStore.getState().addMaskingRule(v.id, rule)
    const ruleId = getVariants()[0].maskingRules[0].id
    useReportStore.getState().removeMaskingRule(v.id, ruleId)
    expect(getVariants()[0].maskingRules).toHaveLength(0)
  })

  it('does nothing when rule id does not exist', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    useReportStore.getState().addMaskingRule(v.id, { targetElementId: 'el-1', type: 'fullReplace', replaceValue: '***' } as MaskingRuleInput)
    useReportStore.getState().removeMaskingRule(v.id, 'bad-rule-id')
    expect(getVariants()[0].maskingRules).toHaveLength(1)
  })
})

// ---------------------------------------------------------------------------
// replaceMaskingRule
// ---------------------------------------------------------------------------

describe('replaceMaskingRule', () => {
  it('replaces the rule at the matching id', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    useReportStore.getState().addMaskingRule(v.id, { targetElementId: 'el-1', type: 'fullReplace', replaceValue: 'old' } as MaskingRuleInput)
    const ruleId = getVariants()[0].maskingRules[0].id
    const updated: MaskingRule = { id: ruleId, targetElementId: 'el-1', type: 'fullReplace', replaceValue: 'new' }
    useReportStore.getState().replaceMaskingRule(v.id, updated)
    const rules = getVariants()[0].maskingRules
    expect(rules[0].type === 'fullReplace' && rules[0].replaceValue).toBe('new')
  })

  it('can switch a rule from fullReplace to partial', () => {
    useReportStore.getState().addVariant('v1')
    const [v] = getVariants()
    useReportStore.getState().addMaskingRule(v.id, { targetElementId: 'el-1', type: 'fullReplace', replaceValue: '***' } as MaskingRuleInput)
    const ruleId = getVariants()[0].maskingRules[0].id
    const updated: MaskingRule = { id: ruleId, targetElementId: 'el-1', type: 'partial', keepFirst: 3, keepLast: 2 }
    useReportStore.getState().replaceMaskingRule(v.id, updated)
    const rule = getVariants()[0].maskingRules[0]
    expect(rule.type).toBe('partial')
  })
})

// ---------------------------------------------------------------------------
// cleanupVariantRefsForElement
// ---------------------------------------------------------------------------

describe('cleanupVariantRefsForElement', () => {
  it('removes element from hiddenElementIds across all variants', () => {
    useReportStore.getState().addVariant('v1')
    useReportStore.getState().addVariant('v2')
    const [v1, v2] = getVariants()
    useReportStore.getState().toggleElementHidden(v1.id, 'el-1')
    useReportStore.getState().toggleElementHidden(v2.id, 'el-1')
    useReportStore.getState().cleanupVariantRefsForElement('el-1')
    expect(getVariants()[0].hiddenElementIds).not.toContain('el-1')
    expect(getVariants()[1].hiddenElementIds).not.toContain('el-1')
  })

  it('removes masking rules targeting the element across all variants', () => {
    useReportStore.getState().addVariant('v1')
    const [v1] = getVariants()
    useReportStore.getState().addMaskingRule(v1.id, { targetElementId: 'el-1', type: 'fullReplace', replaceValue: '***' } as MaskingRuleInput)
    useReportStore.getState().cleanupVariantRefsForElement('el-1')
    expect(getVariants()[0].maskingRules).toHaveLength(0)
  })

  it('does not remove refs for other elements', () => {
    useReportStore.getState().addVariant('v1')
    const [v1] = getVariants()
    useReportStore.getState().toggleElementHidden(v1.id, 'el-keep')
    useReportStore.getState().addMaskingRule(v1.id, { targetElementId: 'el-keep', type: 'fullReplace', replaceValue: '***' } as MaskingRuleInput)
    useReportStore.getState().cleanupVariantRefsForElement('el-remove')
    expect(getVariants()[0].hiddenElementIds).toContain('el-keep')
    expect(getVariants()[0].maskingRules).toHaveLength(1)
  })

  it('does nothing when no variants exist', () => {
    expect(() => useReportStore.getState().cleanupVariantRefsForElement('el-1')).not.toThrow()
  })
})
