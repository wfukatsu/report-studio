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

  // #144: the coded "modern" templates ship a named product lookup relation that
  // must survive the Zod import boundary (guards the "silently stripped" caveat).
  it('coded modern templates carry a product lookup relation that round-trips', () => {
    for (const id of ['invoice-modern', 'quotation-modern', 'purchase-order-modern']) {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === id)
      expect(t, id).toBeDefined()
      const parsed = ReportDefinitionSchema.parse(t!.definition)
      const rel = parsed.schema?.relations?.find((r) => r.kind === 'lookup')
      expect(rel, `${id} lookup relation`).toMatchObject({
        name: 'product',
        to: '__productMaster__',
        on: { fromColumn: 'product_code', toColumn: 'code' },
        kind: 'lookup',
      })
      // The relation's `from` points at the template's detail group.
      const detail = parsed.schema?.groups.find((g) => g.role === 'detail')
      expect(rel!.from).toBe(detail?.id)
    }
  })

  it('free-text quotation templates declare no lookup relation', () => {
    for (const id of ['quotation-basic-invoice', 'quotation-discount-invoice', 'quotation-english']) {
      const t = BUILTIN_TEMPLATES.find((x) => x.id === id)
      expect(t, id).toBeDefined()
      const parsed = ReportDefinitionSchema.parse(t!.definition)
      expect(parsed.schema?.relations ?? [], id).toHaveLength(0)
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
