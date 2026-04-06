import { describe, it, expect } from 'vitest'
import { importFromJSON } from './migration'

function makeValidV1Json(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    $schema: 'report-definition/v1',
    id: 'test-id',
    metadata: { documentName: 'Test', version: '1.0', reportType: 'general' },
    pageSettings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
    defaultTextStyle: {},
    templateVariables: [],
    calculationRules: [],
    dataSources: [],
    outputVariants: [],
    submissionModels: [],
    validationRules: [],
    pages: [{
      id: 'page-1',
      name: 'Page 1',
      width: 210,
      height: 297,
      background: '#ffffff',
      sections: [{ id: 'sec-1', sectionType: 'body', height: 297, elements: [] }],
    }],
    ...overrides,
  })
}

describe('importFromJSON — Zod schema validation', () => {
  it('accepts a valid ReportDefinition', () => {
    const result = importFromJSON(makeValidV1Json())
    expect(result.ok).toBe(true)
  })

  it('rejects when id is missing', () => {
    // JSON.stringify drops undefined, so we need to use a parsed override
    const obj = JSON.parse(makeValidV1Json())
    delete obj.id
    const result = importFromJSON(JSON.stringify(obj))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('必須フィールドが不正または不足しています')
  })

  it('rejects when metadata is missing', () => {
    const obj = JSON.parse(makeValidV1Json())
    delete obj.metadata
    const result = importFromJSON(JSON.stringify(obj))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain('必須フィールドが不正または不足しています')
  })

  it('rejects when pages array exceeds max (50)', () => {
    const pages = Array.from({ length: 51 }, (_, i) => ({
      id: `page-${i}`,
      name: `Page ${i}`,
      width: 210,
      height: 297,
      background: '#ffffff',
      sections: [{ id: `sec-${i}`, sectionType: 'body', height: 297, elements: [] }],
    }))
    const result = importFromJSON(makeValidV1Json({ pages }))
    expect(result.ok).toBe(false)
  })

  it('rejects when elements per section exceeds max (300)', () => {
    const elements = Array.from({ length: 301 }, (_, i) => ({
      id: `el-${i}`,
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 10, height: 10 },
      zIndex: i,
      locked: false,
      visible: true,
      content: 'x',
      style: {},
    }))
    const obj = JSON.parse(makeValidV1Json())
    obj.pages[0].sections[0].elements = elements
    const result = importFromJSON(JSON.stringify(obj))
    expect(result.ok).toBe(false)
  })

  it('rejects when calculationRules expression exceeds max length (500)', () => {
    const longExpression = 'a'.repeat(501)
    const obj = JSON.parse(makeValidV1Json())
    obj.calculationRules = [{
      key: 'total',
      label: 'Total',
      expression: longExpression,
      resultType: 'number',
      onError: 'zero',
    }]
    const result = importFromJSON(JSON.stringify(obj))
    expect(result.ok).toBe(false)
  })

  it('strips legacy visibilityRule on import (field is no longer validated)', () => {
    const longRule = 'x'.repeat(501)
    const obj = JSON.parse(makeValidV1Json())
    obj.pages[0].sections[0].elements = [{
      id: 'el-1',
      type: 'text',
      position: { x: 0, y: 0 },
      size: { width: 100, height: 20 },
      zIndex: 1,
      locked: false,
      visible: true,
      visibilityRule: longRule,
      content: 'test',
      style: {},
    }]
    const result = importFromJSON(JSON.stringify(obj))
    // visibilityRule is stripped (not rejected) — import succeeds
    expect(result.ok).toBe(true)
    if (result.ok) {
      const el = result.definition.pages[0]?.sections[0]?.elements[0]
      expect(el).toBeDefined()
      expect('visibilityRule' in (el ?? {})).toBe(false)
    }
  })

  it('includes field path in error message', () => {
    const obj = JSON.parse(makeValidV1Json())
    obj.pageSettings.unit = 'px'  // must be 'mm'
    const result = importFromJSON(JSON.stringify(obj))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('必須フィールドが不正または不足しています')
    }
  })
})
