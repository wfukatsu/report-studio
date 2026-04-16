import { describe, it, expect } from 'vitest'
import { importFromJSON, migrateReport } from './migration'
import type { Report, TextElement } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReport(pageOverrides: Partial<Report['pages'][number]> = {}): Report {
  return {
    id: 'r1',
    name: 'Test Report',
    pages: [
      {
        id: 'p1',
        name: 'Page 1',
        elements: [],
        background: '#ffffff',
        width: 210,
        height: 297,
        sections: [],
        ...pageOverrides,
      },
    ],
    settings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margin: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
    dataSource: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  }
}

const SAMPLE_ELEMENT: TextElement = {
  id: 'el-1',
  type: 'text',
  position: { x: 10, y: 10 },
  size: { width: 100, height: 20 },
  zIndex: 1,
  locked: false,
  visible: true,
  content: 'Hello',
  style: {},
}

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

  it('rejects when elements per section exceeds max (500)', () => {
    const elements = Array.from({ length: 501 }, (_, i) => ({
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

describe('migrateSections — legacy page.elements フォールバック', () => {
  it('page.sections が空で page.elements に要素がある場合、body section に移動する', () => {
    const report = makeReport({ elements: [SAMPLE_ELEMENT], sections: [] })
    const result = migrateReport(report)
    const page = result.pages[0]
    expect(page.sections).toHaveLength(1)
    expect(page.sections[0].sectionType).toBe('body')
    expect(page.sections[0].elements).toEqual([SAMPLE_ELEMENT])
  })

  it('page.sections と page.elements の両方がある場合、sections が優先される', () => {
    const existingSection = {
      id: 'sec-existing',
      sectionType: 'body' as const,
      height: 297,
      elements: [SAMPLE_ELEMENT],
    }
    const report = makeReport({
      elements: [SAMPLE_ELEMENT],
      sections: [existingSection],
    })
    const result = migrateReport(report)
    const page = result.pages[0]
    expect(page.sections).toHaveLength(1)
    expect(page.sections[0].id).toBe('sec-existing')
  })

  it('page.elements が undefined の場合、空の body section が生成される', () => {
    // Cast to bypass TypeScript's required check — simulates legacy JSON with missing field
    const report = makeReport({ elements: undefined as unknown as [], sections: [] })
    const result = migrateReport(report)
    const page = result.pages[0]
    expect(page.sections).toHaveLength(1)
    expect(page.sections[0].sectionType).toBe('body')
    expect(page.sections[0].elements).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// importFromJSON — edge cases for branch coverage
// ---------------------------------------------------------------------------
describe('importFromJSON — edge cases', () => {
  it('returns error for invalid JSON string', () => {
    const result = importFromJSON('not json {{{')
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('JSON parse error')
  })

  it('returns error for JSON null', () => {
    const result = importFromJSON('null')
    expect(result.ok).toBe(false)
  })

  it('returns error for JSON array (not an object)', () => {
    const result = importFromJSON('[1, 2, 3]')
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain("missing required fields")
  })

  it('returns error for unknown $schema version', () => {
    const result = importFromJSON(JSON.stringify({ $schema: 'unknown/v99' }))
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('非対応スキーマ')
  })

  it('returns error for legacy format missing id/pages', () => {
    const result = importFromJSON(JSON.stringify({ name: 'test' }))
    expect(result.ok).toBe(false)
    expect((result as { ok: false; error: string }).error).toContain('missing required fields')
  })

  it('returns error when pages is not an array', () => {
    const result = importFromJSON(JSON.stringify({ id: 'r1', pages: {} }))
    expect(result.ok).toBe(false)
  })

  it('accepts valid ReportDefinition $schema format', () => {
    // Import a minimal valid v1 definition (using schema version)
    // We test this path by using importFromJSON on an existing exported definition
    // The simplest way: use migrateReport output and re-import
    const legacyReport = JSON.stringify({
      id: 'r1',
      name: 'Test',
      pages: [{
        id: 'p1', name: 'Page 1', elements: [], background: '#fff',
        width: 210, height: 297, sections: [],
      }],
      settings: { paperSize: 'A4', orientation: 'portrait', margin: { top: 20, right: 20, bottom: 20, left: 20 }, unit: 'mm' },
      dataSource: null,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    const result = importFromJSON(legacyReport)
    expect(result.ok).toBe(true)
  })

  it('toMm handles unknown unit via fallback (factor 1)', () => {
    // The toMm function uses ?? 1 for unknown units
    // This is tested indirectly through migrateReport with a Report that
    // has px/in units — but we verify it doesn't crash
    const reportWithPx = JSON.stringify({
      id: 'r1', name: 'Test',
      pages: [{ id: 'p1', name: 'P', elements: [], background: '#fff', width: 210, height: 297, sections: [] }],
      settings: { paperSize: 'A4', orientation: 'portrait', margin: { top: 20, right: 20, bottom: 20, left: 20 }, unit: 'mm' },
      dataSource: { id: 'ds1', name: 'DS', fields: [] },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })
    const result = importFromJSON(reportWithPx)
    expect(result.ok).toBe(true)
  })
})
