/**
 * Projection tests — the summary/outline views that keep a template readable
 * without spending an agent's whole context on it.
 */
import { describe, it, expect } from 'vitest'
import {
  unwrapEnvelope, walkElements, bindingOf, buildSummary, formatSummary,
  buildOutline, formatOutline, findStrayPageElements,
} from './projection.mjs'

function envelope() {
  return {
    formatVersion: 2,
    id: 'tpl-1',
    name: '請求書',
    visibility: 'private',
    updatedAt: '2026-07-27T12:00:00Z',
    definition: {
      metadata: { name: '請求書', description: 'テスト' },
      pageSettings: { paperSize: 'A4', orientation: 'portrait' },
      calculationRules: [{ id: 'c1' }],
      validationRules: [],
      dataSources: [{ id: 'd1', name: 'サンプル' }],
      outputVariants: [],
      pages: [
        {
          id: 'p1',
          name: 'ページ 1',
          width: 210,
          height: 297,
          sections: [
            {
              id: 'sec-head',
              sectionType: 'header',
              elements: [
                { id: 'u-1', type: 'text', position: { x: 1, y: 2 }, size: { width: 3, height: 4 }, content: '固定文言' },
              ],
            },
            {
              id: 'sec-body',
              sectionType: 'body',
              elements: [
                { id: 'u-2', type: 'dataField', position: { x: 5, y: 6 }, size: { width: 7, height: 8 }, fieldKey: 'customer.name' },
                { id: 'u-3', type: 'repeatingBand', position: { x: 0, y: 0 }, size: { width: 10, height: 10 }, dataSource: 'items' },
                { id: 'u-4', type: 'text', position: { x: 0, y: 0 }, size: { width: 1, height: 1 }, content: '合計 {{summary.total}} 円' },
              ],
            },
          ],
        },
      ],
      schema: {
        groups: [
          { id: 'g1', dataKey: 'customer', role: 'master', label: '顧客', fields: [{ id: 'f', key: 'name', label: '氏名', type: 'string' }], tableMeta: { namespace: 'demo', tableName: 'cust' } },
        ],
      },
    },
  }
}

describe('unwrapEnvelope', () => {
  it('splits the resource envelope into definition + meta', () => {
    const { definition, meta } = unwrapEnvelope(envelope())
    expect(meta).toMatchObject({ id: 'tpl-1', name: '請求書', visibility: 'private', formatVersion: 2 })
    expect(definition.pages).toHaveLength(1)
  })

  it('tolerates a bare definition (no envelope)', () => {
    const { definition, meta } = unwrapEnvelope({ pages: [], metadata: { name: '裸' } })
    expect(definition.pages).toEqual([])
    expect(meta.name).toBe('裸')
  })
})

describe('walkElements', () => {
  it('walks pages → sections → elements in render order', () => {
    const rows = walkElements(envelope().definition)
    expect(rows.map((r) => r.element.id)).toEqual(['u-1', 'u-2', 'u-3', 'u-4'])
    expect(rows[0].sectionType).toBe('header')
  })

  it('ignores the deprecated page.elements, matching the renderer', () => {
    const def = envelope().definition
    def.pages[0].elements = [{ id: 'ghost', type: 'text' }]
    expect(walkElements(def).map((r) => r.element.id)).not.toContain('ghost')
    expect(findStrayPageElements(def)).toEqual([{ pageIndex: 0, count: 1 }])
  })
})

describe('bindingOf', () => {
  it('reads fieldKey, dataSource, and {{tokens}}', () => {
    expect(bindingOf({ type: 'dataField', fieldKey: 'customer.name' })).toBe('customer.name')
    expect(bindingOf({ type: 'repeatingBand', dataSource: 'items' })).toBe('items[]')
    expect(bindingOf({ type: 'text', content: '{{a.b}} と {{c}}' })).toBe('a.b,c')
  })

  it('marks tenant elements and static text', () => {
    expect(bindingOf({ type: 'tenantCompanyName' })).toBe('(tenant)')
    expect(bindingOf({ type: 'text', content: '固定' })).toBe('-')
  })
})

describe('buildSummary', () => {
  it('counts elements by type and separates bound from static', () => {
    const s = buildSummary(unwrapEnvelope(envelope()))
    expect(s.elements.total).toBe(4)
    expect(s.elements.bound).toBe(3) // dataField + repeatingBand + tokenized text
    expect(s.elements.unbound).toBe(1)
    expect(s.elements.byType).toMatchObject({ text: 2, dataField: 1, repeatingBand: 1 })
  })

  it('reports paper, schema bindings and rule counts', () => {
    const s = buildSummary(unwrapEnvelope(envelope()))
    expect(s.paper).toBe('A4P')
    expect(s.schema[0]).toMatchObject({ dataKey: 'customer', role: 'master', fields: 1, table: 'demo.cust' })
    expect(s.rules).toEqual({ calculation: 1, validation: 0 })
  })

  it('stays small enough to be worth calling (the whole point of the view)', () => {
    const text = formatSummary(buildSummary(unwrapEnvelope(envelope())))
    expect(text.length).toBeLessThan(2000)
    expect(text).toContain('請求書')
  })

  it('surfaces stray page.elements as a visible warning', () => {
    const env = envelope()
    env.definition.pages[0].elements = [{ id: 'ghost', type: 'text' }]
    expect(formatSummary(buildSummary(unwrapEnvelope(env)))).toMatch(/@deprecated/)
  })
})

describe('buildOutline', () => {
  it('assigns sequential handles in render order across sections', () => {
    const { map, total } = buildOutline(envelope().definition)
    expect(total).toBe(4)
    expect(map).toEqual({ e1: 'u-1', e2: 'u-2', e3: 'u-3', e4: 'u-4' })
  })

  it('keeps handle numbering global when filtering to one page', () => {
    const env = envelope()
    env.definition.pages.push({ id: 'p2', name: 'ページ 2', width: 210, height: 297, sections: [{ id: 's2', sectionType: 'body', elements: [{ id: 'u-9', type: 'text', position: { x: 0, y: 0 }, size: { width: 1, height: 1 } }] }] })
    const { groups, map } = buildOutline(env.definition, { pageFilter: 1 })
    // Filtering the view must not renumber: e5 still means u-9 everywhere.
    expect(map.e5).toBe('u-9')
    expect(groups).toHaveLength(1)
    expect(groups[0].entries[0].handle).toBe('e5')
  })

  it('renders TSV rows an agent can read cheaply', () => {
    const def = envelope().definition
    const text = formatOutline({ name: '請求書', updatedAt: 'x', pageCount: 1 }, buildOutline(def), '/tmp/h.json')
    expect(text).toContain('id\ttype\trect\tbind\tname')
    expect(text).toContain('e2\tdataField\t5,6,7,8\tcustomer.name')
    // Cheaper than the JSON it replaces.
    expect(text.length).toBeLessThan(JSON.stringify(def).length / 2)
  })
})
