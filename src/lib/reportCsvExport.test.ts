import { describe, it, expect } from 'vitest'
import { buildReportCsv, collectReportTables } from './reportCsvExport'
import type { ReportDefinition } from '@/types'

const BOM = '﻿'

/** Minimal definition with one repeatingBand bound to `dataSource`. */
function defWithBand(dataSource?: string): ReportDefinition {
  const band = {
    id: 'band-1', type: 'repeatingBand', position: { x: 0, y: 0 }, size: { width: 100, height: 20 },
    zIndex: 0, visible: true, locked: false, ...(dataSource ? { dataSource } : {}),
  }
  return {
    formatVersion: 2,
    metadata: { documentName: 't' },
    pageSettings: { paperSize: 'A4', orientation: 'portrait', margins: { top: 0, right: 0, bottom: 0, left: 0 } },
    pages: [{ id: 'p1', name: 'P', background: '#fff', width: 210, height: 297,
      sections: [{ id: 's1', sectionType: 'body', height: 297, elements: [band] }] }],
  } as unknown as ReportDefinition
}

describe('collectReportTables', () => {
  it('prefers the array referenced by a repeating element dataSource', () => {
    const def = defWithBand('items')
    const data = { items: [{ code: 'A', qty: 1 }], other: [{ x: 1 }] }
    const tables = collectReportTables(def, data)
    expect(tables[0].name).toBe('items')
    expect(tables.map((t) => t.name)).toEqual(['items', 'other'])
  })

  it('falls back to any top-level array-of-objects when no dataSource matches', () => {
    const def = defWithBand()
    const data = { rows: [{ a: 1 }, { a: 2 }] }
    const tables = collectReportTables(def, data)
    expect(tables).toHaveLength(1)
    expect(tables[0].name).toBe('rows')
  })

  it('ignores arrays of primitives and empty arrays', () => {
    const def = defWithBand()
    const data = { tags: ['a', 'b'], empty: [], rows: [{ a: 1 }] }
    const tables = collectReportTables(def, data)
    expect(tables.map((t) => t.name)).toEqual(['rows'])
  })
})

describe('buildReportCsv', () => {
  it('returns empty string when there is nothing to export', () => {
    expect(buildReportCsv(defWithBand(), {})).toBe('')
  })

  it('emits a BOM + header + rows for a single table', () => {
    const def = defWithBand('items')
    const csv = buildReportCsv(def, { items: [{ code: 'A', qty: 2 }, { code: 'B', qty: 3 }] })
    expect(csv.startsWith(BOM)).toBe(true)
    expect(csv.slice(1)).toBe('code,qty\nA,2\nB,3')
  })

  it('takes the union of keys across rows (first-appearance order)', () => {
    const def = defWithBand('items')
    const csv = buildReportCsv(def, { items: [{ a: 1 }, { a: 2, b: 9 }] })
    expect(csv.slice(1)).toBe('a,b\n1,\n2,9')
  })

  it('escapes commas, quotes and newlines per RFC 4180', () => {
    const def = defWithBand('items')
    const csv = buildReportCsv(def, { items: [{ name: 'a,b', note: 'he said "hi"', multi: 'x\ny' }] })
    expect(csv.slice(1)).toBe('name,note,multi\n"a,b","he said ""hi""","x\ny"')
  })

  it('emits scalar master fields as a 項目/値 block and labels multiple blocks', () => {
    const def = defWithBand('items')
    const csv = buildReportCsv(def, { invoiceNo: 'INV-1', total: 154000, items: [{ code: 'A' }] })
    const body = csv.slice(1)
    expect(body).toContain('「項目」\n項目,値\ninvoiceNo,INV-1\ntotal,154000')
    expect(body).toContain('「items」\ncode\nA')
  })

  it('serializes nested object/array cell values as JSON', () => {
    const def = defWithBand('items')
    const csv = buildReportCsv(def, { items: [{ meta: { k: 1 }, tags: ['x', 'y'] }] })
    expect(csv.slice(1)).toBe('meta,tags\n"{""k"":1}","[""x"",""y""]"')
  })
})
