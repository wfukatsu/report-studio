/**
 * Element registry integrity tests (#414).
 *
 * The registry is the single registration point for element types; these tests
 * pin the referential integrity between the registry and the data-driven
 * registration points that intentionally stayed outside it
 * (paletteData / elementFactories), plus the metadata that replaced the old
 * per-file switches (bindable / isEmptyInPreview / layer icon+name).
 */
import { describe, it, expect } from 'vitest'
import { ELEMENT_REGISTRY, getElementDef } from './registry'
import { ELEMENT_TYPES } from '@/types/elementTypes'
import { PALETTE_CATEGORIES } from '@/components/sidebar/paletteData'
import { BINDABLE_TYPES, isBindableType } from '@/components/bindingEditor/types'
import * as factories from '@/lib/elementFactories'
import i18n from '@/i18n/config'
import type { ReportElement } from '@/types'

const tf = i18n.getFixedT('ja', 'components')

function stub(type: ReportElement['type']): ReportElement {
  return {
    id: 'stub', type, position: { x: 0, y: 0 }, size: { width: 10, height: 10 },
    zIndex: 1, visible: true, locked: false,
  } as unknown as ReportElement
}

describe('ELEMENT_REGISTRY', () => {
  it('registers exactly the 24 ELEMENT_TYPES', () => {
    expect(Object.keys(ELEMENT_REGISTRY).sort()).toEqual([...ELEMENT_TYPES].sort())
    expect(ELEMENT_TYPES).toHaveLength(24)
  })

  it.each([...ELEMENT_TYPES])('def "%s" is self-consistent', (type) => {
    const def = getElementDef(type)
    expect(def.type).toBe(type)
    expect(typeof def.renderElement).toBe('function')
    expect(def.PropertiesPanel).toBeTruthy()
    expect(def.layerIcon).toBeTruthy()
    expect(typeof def.layerName).toBe('function')
    expect(typeof def.bindable).toBe('boolean')
  })

  it.each([...ELEMENT_TYPES])('def "%s" resolves a non-empty layer name', (type) => {
    const name = getElementDef(type).layerName(stub(type), tf)
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })

  it('throws for unknown element types (assertNever parity)', () => {
    expect(() => getElementDef('nope' as ReportElement['type'])).toThrow(/Unhandled element type/)
  })
})

describe('registry ↔ paletteData integrity', () => {
  const items = PALETTE_CATEGORIES.flatMap((cat) => cat.items)

  it('every palette item creates an element whose type is registered', () => {
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) {
      const el = item.createElement()
      expect(ELEMENT_REGISTRY[el.type], `palette item "${item.label}" → type "${el.type}"`).toBeTruthy()
    }
  })
})

describe('registry ↔ elementFactories integrity', () => {
  it('every factory creates an element whose type is registered', () => {
    const names = Object.keys(factories).filter((k) => k.startsWith('create'))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) {
      const fn = factories[name as keyof typeof factories] as (arg?: unknown) => ReportElement
      const el = name === 'createDataFieldFromSchema'
        ? fn({ fieldId: 'f1', fieldKey: 'g.k', fieldLabel: 'L' })
        : fn()
      expect(ELEMENT_REGISTRY[el.type], `factory "${name}" → type "${el.type}"`).toBeTruthy()
    }
  })
})

describe('bindable metadata (BINDABLE_TYPES parity)', () => {
  it('matches the historical whitelist: dataField, text, checkbox, eraSelect', () => {
    expect([...BINDABLE_TYPES].sort()).toEqual(['checkbox', 'dataField', 'eraSelect', 'text'])
  })

  it('isBindableType agrees with registry bindable flags for all types', () => {
    for (const type of ELEMENT_TYPES) {
      expect(isBindableType(type), type).toBe(ELEMENT_REGISTRY[type].bindable)
    }
  })
})

describe('isEmptyInPreview metadata (previewUtils parity)', () => {
  it('is defined exactly for the four historically-suppressible types', () => {
    const withEmpty = ELEMENT_TYPES.filter((t) => getElementDef(t).isEmptyInPreview !== undefined)
    expect(withEmpty.sort()).toEqual(['chart', 'dataField', 'repeatingBand', 'text'])
  })
})
