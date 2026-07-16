import { describe, it, expect } from 'vitest'
import { BUILTIN_TEMPLATES } from './builtinTemplates'
import { ReportDefinitionSchema } from '@/lib/schemas/reportDefinition'

describe('BUILTIN_TEMPLATES', () => {
  it('loads every registered template', () => {
    // 9 metadata entries → 9 loaded entries (none dropped by validation)
    expect(BUILTIN_TEMPLATES.length).toBe(9)
  })

  it('each template passes ReportDefinitionSchema and stores elements in sections', () => {
    for (const t of BUILTIN_TEMPLATES) {
      expect(ReportDefinitionSchema.safeParse(t.definition).success).toBe(true)
      for (const page of t.definition.pages) {
        // Page.elements is deprecated — elements must live under sections[]
        expect((page as { elements?: unknown }).elements).toBeUndefined()
      }
    }
  })
})

describe('element-showcase template', () => {
  const showcase = BUILTIN_TEMPLATES.find((t) => t.id === 'element-showcase')

  it('is registered and multi-page', () => {
    expect(showcase).toBeDefined()
    expect(showcase!.definition.pages.length).toBe(2)
  })

  it('exercises the newly-supported element types', () => {
    const types = new Set(
      showcase!.definition.pages.flatMap((p) => p.sections.flatMap((s) => s.elements.map((e) => e.type))),
    )
    for (const t of ['hanko', 'eraSelect', 'revenueStamp', 'approvalStampRow', 'manualEntry',
      'chart', 'repeatingBand', 'repeatingList', 'tenantCompanyName', 'tenantLogo',
      'pageNumber', 'currentDate', 'dataField', 'formTable']) {
      expect(types.has(t as never)).toBe(true)
    }
  })

  it('uses wareki and kanji_numeral (大字) formats', () => {
    const formats = showcase!.definition.pages
      .flatMap((p) => p.sections.flatMap((s) => s.elements))
      .filter((e) => e.type === 'dataField')
      .map((e) => (e as { format?: { type?: string } }).format?.type)
    expect(formats).toContain('wareki_full')
    expect(formats).toContain('kanji_numeral')
  })
})
