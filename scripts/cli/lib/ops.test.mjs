/**
 * Op application + invariant regression tests.
 *
 * The four invariant cases are pinned deliberately: each is a Report Studio
 * footgun that the server accepts silently and that only surfaces later as
 * "my element disappeared". If one of these stops being rejected, an agent can
 * corrupt a template without any error at save time.
 */
import { describe, it, expect } from 'vitest'
import { applyOps, checkInvariants, OpsError } from './ops.mjs'

/** Minimal well-formed definition: one A4 page, one body section, one element. */
function fixture() {
  return {
    id: 'tpl-1',
    metadata: { name: 'テスト帳票' },
    pageSettings: { paperSize: 'A4', orientation: 'portrait' },
    calculationRules: [],
    validationRules: [],
    dataSources: [],
    outputVariants: [],
    pages: [
      {
        id: 'page-1',
        name: 'ページ 1',
        width: 210,
        height: 297,
        sections: [
          {
            id: 'sec-body',
            sectionType: 'body',
            height: 297,
            elements: [
              {
                id: 'el-1',
                type: 'text',
                position: { x: 10, y: 10 },
                size: { width: 50, height: 8 },
                content: 'タイトル',
                style: {},
              },
            ],
          },
        ],
      },
    ],
    schema: {
      groups: [
        {
          id: 'g1',
          label: '顧客',
          role: 'master',
          dataKey: 'customer',
          fields: [{ id: 'f1', key: 'name', label: '氏名', type: 'string' }],
        },
      ],
    },
  }
}

describe('applyOps — element ops', () => {
  it('addElement lands in sections[].elements, not page.elements', () => {
    const def = fixture()
    applyOps(def, [
      { op: 'addElement', pageIndex: 0, element: { type: 'dataField', fieldKey: 'customer.name', x: 5, y: 20 } },
    ])
    expect(def.pages[0].sections[0].elements).toHaveLength(2)
    expect(def.pages[0].elements).toBeUndefined()
  })

  it('addElement normalizes flat x/y/width/height into position/size', () => {
    const def = fixture()
    applyOps(def, [{ op: 'addElement', pageIndex: 0, element: { type: 'text', x: 3, y: 4, width: 20, height: 6 } }])
    const added = def.pages[0].sections[0].elements[1]
    expect(added.position).toEqual({ x: 3, y: 4 })
    expect(added.size).toEqual({ width: 20, height: 6 })
    expect(added.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('updateElement merges nested objects and replaces scalars', () => {
    const def = fixture()
    applyOps(def, [{ op: 'updateElement', elementId: 'el-1', patch: { content: '新タイトル', style: { fontSize: 14 } } }])
    const el = def.pages[0].sections[0].elements[0]
    expect(el.content).toBe('新タイトル')
    expect(el.style.fontSize).toBe(14)
  })

  it('moveElement updates the rect', () => {
    const def = fixture()
    applyOps(def, [{ op: 'moveElement', elementId: 'el-1', x: 99, height: 12 }])
    const el = def.pages[0].sections[0].elements[0]
    expect(el.position).toEqual({ x: 99, y: 10 })
    expect(el.size).toEqual({ width: 50, height: 12 })
  })

  it('removeElement drops it', () => {
    const def = fixture()
    applyOps(def, [{ op: 'removeElement', elementId: 'el-1' }])
    expect(def.pages[0].sections[0].elements).toHaveLength(0)
  })

  it('addPage creates a page WITH a body section (elements need somewhere legal to go)', () => {
    const def = fixture()
    applyOps(def, [{ op: 'addPage', preset: 'A4L' }])
    expect(def.pages).toHaveLength(2)
    expect(def.pages[1].width).toBe(297)
    expect(def.pages[1].sections[0].sectionType).toBe('body')
  })

  it('resolves short handles through the injected resolver', () => {
    const def = fixture()
    applyOps(def, [{ op: 'removeElement', elementId: 'e1' }], (ref) =>
      ref === 'e1' ? { ok: true, id: 'el-1' } : { ok: true, id: ref },
    )
    expect(def.pages[0].sections[0].elements).toHaveLength(0)
  })

  it('reports a stale handle map instead of editing the wrong element', () => {
    const def = fixture()
    expect(() =>
      applyOps(def, [{ op: 'removeElement', elementId: 'e1' }], () => ({ ok: false, reason: 'マップが古い' })),
    ).toThrow(OpsError)
  })

  it('rejects an unknown op with the list of valid ops', () => {
    expect(() => applyOps(fixture(), [{ op: 'frobnicate' }])).toThrow(/未知の op/)
  })

  it('rejects an empty ops array', () => {
    expect(() => applyOps(fixture(), [])).toThrow(/ops が空/)
  })
})

describe('checkInvariants — the four silent footguns', () => {
  it('1. rejects elements parked on the deprecated page.elements', () => {
    const def = fixture()
    def.pages[0].elements = [{ id: 'x', type: 'text' }]
    const { errors } = checkInvariants(def)
    expect(errors.join()).toMatch(/page\[0\]\.elements/)
  })

  it('2. rejects a 3-level fieldKey (renders from sample JSON but is not DB-bindable)', () => {
    const def = fixture()
    expect(() =>
      applyOps(def, [
        { op: 'addElement', pageIndex: 0, element: { type: 'dataField', fieldKey: 'quotation.customer.name' } },
      ]),
    ).toThrow(/3階層/)
  })

  it('2b. allows 1- and 2-level fieldKeys', () => {
    const def = fixture()
    applyOps(def, [
      { op: 'addElement', pageIndex: 0, element: { type: 'dataField', fieldKey: 'customer.name' } },
      { op: 'addElement', pageIndex: 0, element: { type: 'dataField', fieldKey: 'total' } },
    ])
    expect(checkInvariants(def).errors).toEqual([])
  })

  it('3. rejects an unknown element type', () => {
    expect(() =>
      applyOps(fixture(), [{ op: 'addElement', pageIndex: 0, element: { type: 'sparkline' } }]),
    ).toThrow(/未知の要素型/)
  })

  it('3b. names the replacement for a retired type', () => {
    expect(() =>
      applyOps(fixture(), [{ op: 'addElement', pageIndex: 0, element: { type: 'table' } }]),
    ).toThrow(/formTable/)
  })

  it('4. warns when a schema key would be stripped at the Zod import boundary', () => {
    const def = fixture()
    const { warnings } = applyOps(def, [
      { op: 'setSchemaField', dataKey: 'customer', fieldKey: 'name', patch: { newBindingThing: 1 } },
    ])
    expect(warnings.join()).toMatch(/newBindingThing/)
  })

  it('4b. does NOT warn for the explicitly-allowed binding keys', () => {
    const def = fixture()
    const { warnings } = applyOps(def, [
      { op: 'setSchemaField', dataKey: 'customer', fieldKey: 'name', patch: { dbColumnName: 'customer_name' } },
      { op: 'setSchemaGroup', dataKey: 'customer', patch: { tableMeta: { namespace: 'demo', tableName: 'cust' } } },
    ])
    expect(warnings).toEqual([])
  })

  it('rejects an identifier that violates the shared DB identifier pattern', () => {
    const def = fixture()
    expect(() => applyOps(def, [{ op: 'setSchemaGroup', dataKey: 'customer', patch: { dataKey: '9bad' } }])).toThrow(
      /dataKey/,
    )
  })
})

describe('setPointer', () => {
  it('sets a nested value', () => {
    const def = fixture()
    applyOps(def, [{ op: 'setPointer', pointer: '/pages/0/background', value: '#eee' }])
    expect(def.pages[0].background).toBe('#eee')
  })

  it('rejects a pointer whose path does not exist', () => {
    expect(() => applyOps(fixture(), [{ op: 'setPointer', pointer: '/nope/0/x', value: 1 }])).toThrow(/経路が存在しません/)
  })

  it('rejects a non-pointer string', () => {
    expect(() => applyOps(fixture(), [{ op: 'setPointer', pointer: 'pages', value: 1 }])).toThrow(/JSON Pointer/)
  })

  it('cannot smuggle elements onto page.elements via a pointer', () => {
    expect(() =>
      applyOps(fixture(), [{ op: 'setPointer', pointer: '/pages/0/name', value: 'ok' }, { op: 'setPointer', pointer: '/pages/0/sections/0/elements/0/type', value: 'label' }]),
    ).toThrow(/廃止/)
  })
})
