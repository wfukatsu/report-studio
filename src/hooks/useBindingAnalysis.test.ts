import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useReportStore } from '@/store'
import { useBindingAnalysis } from './useBindingAnalysis'
import type { TextElement, DataFieldElement, CheckboxElement, EraSelectElement } from '@/types'

// ---------------------------------------------------------------------------
// Minimal element factories
// ---------------------------------------------------------------------------

const BASE = {
  position: { x: 0, y: 0 },
  size: { width: 40, height: 10 },
  zIndex: 0,
  locked: false,
  visible: true,
}

function makeText(id: string, content: string): TextElement {
  return {
    ...BASE,
    id,
    type: 'text',
    content,
    style: { fontSize: 10, fontFamily: 'sans-serif', color: '#000', fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', verticalAlign: 'top', writingMode: 'horizontal-tb', lineHeight: 1.4, letterSpacing: 0 },
  }
}

function makeDataField(id: string, fieldKey: string): DataFieldElement {
  return {
    ...BASE,
    id,
    type: 'dataField',
    fieldKey,
    style: { fontSize: 10, fontFamily: 'sans-serif', color: '#000', fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none', textAlign: 'left', verticalAlign: 'top', writingMode: 'horizontal-tb', lineHeight: 1.4, letterSpacing: 0 },
  }
}

function makeCheckbox(id: string, dataSource?: string): CheckboxElement {
  return {
    ...BASE,
    id,
    type: 'checkbox',
    checked: false,
    checkmark: '✓',
    label: '',
    dataSource,
  }
}

function makeEraSelect(id: string, dataSource?: string): EraSelectElement {
  return {
    ...BASE,
    id,
    type: 'eraSelect',
    dataSource,
  }
}

// ---------------------------------------------------------------------------
// Test setup helpers
// ---------------------------------------------------------------------------

function getPageId() {
  return useReportStore.getState().definition.pages[0].id
}

function addEl(el: TextElement | DataFieldElement | CheckboxElement | EraSelectElement) {
  const pageId = getPageId()
  useReportStore.getState().addElement(pageId, el)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setDataSource(null)
})

describe('useBindingAnalysis — no DataSource', () => {
  it('hasDataSource is false when no datasource set', () => {
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.hasDataSource).toBe(false)
  })

  it('returns empty fieldMappings and errorElements when no datasource', () => {
    addEl(makeDataField('df1', 'customer.name'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.errorElements).toHaveLength(0)
    // fieldMappings still lists bound elements even without datasource
    expect(result.current.fieldMappings).toHaveLength(1)
  })
})

describe('useBindingAnalysis — text elements', () => {
  it('marks text element without tokens as unbound', () => {
    addEl(makeText('t1', '固定テキスト'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements).toHaveLength(1)
    expect(result.current.unboundElements[0].elementId).toBe('t1')
  })

  it('does not mark text element with tokens as unbound', () => {
    addEl(makeText('t2', '氏名: {{customer.name}}'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements).toHaveLength(0)
  })

  it('adds text tokens to fieldMappings', () => {
    addEl(makeText('t3', '{{first}} {{last}}'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.fieldMappings).toHaveLength(2)
    const keys = result.current.fieldMappings.map((m) => m.fieldKey)
    expect(keys).toContain('first')
    expect(keys).toContain('last')
  })

  it('excludes system variables from fieldMappings', () => {
    addEl(makeText('t4', '{{$page}} / {{$totalPages}}'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.fieldMappings).toHaveLength(0)
    // system vars only → still unbound (no data binding)
    expect(result.current.unboundElements).toHaveLength(1)
  })
})

describe('useBindingAnalysis — dataField elements', () => {
  it('marks dataField with empty fieldKey as unbound', () => {
    addEl(makeDataField('df2', ''))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements.map((e) => e.elementId)).toContain('df2')
  })

  it('does not mark dataField with fieldKey as unbound', () => {
    addEl(makeDataField('df3', 'customer.name'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements).toHaveLength(0)
  })

  it('adds dataField with fieldKey to fieldMappings', () => {
    addEl(makeDataField('df4', 'price'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.fieldMappings).toHaveLength(1)
    expect(result.current.fieldMappings[0].fieldKey).toBe('price')
  })
})

describe('useBindingAnalysis — checkbox elements', () => {
  it('marks checkbox without dataSource as unbound', () => {
    addEl(makeCheckbox('cb1'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements.map((e) => e.elementId)).toContain('cb1')
  })

  it('does not mark checkbox with dataSource as unbound', () => {
    addEl(makeCheckbox('cb2', 'isChecked'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements).toHaveLength(0)
  })
})

describe('useBindingAnalysis — eraSelect elements', () => {
  it('marks eraSelect without dataSource as unbound', () => {
    addEl(makeEraSelect('era1'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements.map((e) => e.elementId)).toContain('era1')
  })

  it('does not mark eraSelect with dataSource as unbound', () => {
    addEl(makeEraSelect('era2', 'era'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements).toHaveLength(0)
  })
})

describe('useBindingAnalysis — error detection with DataSource', () => {
  beforeEach(() => {
    useReportStore.getState().setDataSource({
      id: 'ds1',
      name: 'テストDS',
      fields: { 'customer': { name: '山田太郎' }, 'price': 1000 },
    })
  })

  it('hasDataSource is true when datasource set', () => {
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.hasDataSource).toBe(true)
  })

  it('does not flag element with valid fieldKey as error', () => {
    addEl(makeDataField('df5', 'price'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.errorElements).toHaveLength(0)
  })

  it('flags element with unknown fieldKey as error', () => {
    addEl(makeDataField('df6', 'nonexistent.field'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.errorElements).toHaveLength(1)
    expect(result.current.errorElements[0].elementId).toBe('df6')
  })

  it('does not flag fieldKey with empty-string value as error', () => {
    useReportStore.getState().setDataSource({
      id: 'ds2',
      name: 'DS',
      fields: { emptyField: '' },
    })
    addEl(makeDataField('df7', 'emptyField'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.errorElements).toHaveLength(0)
  })

  it('flags text token that does not exist in datasource as error', () => {
    addEl(makeText('t5', '{{missingKey}}'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.errorElements.map((e) => e.fieldKey)).toContain('missingKey')
  })

  it('does not error on valid nested key in text', () => {
    addEl(makeText('t6', '{{customer.name}}'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.errorElements).toHaveLength(0)
  })
})

describe('useBindingAnalysis — all bound and correct', () => {
  beforeEach(() => {
    useReportStore.getState().setDataSource({
      id: 'ds3',
      name: 'DS',
      fields: { name: '太郎', era: '令' },
    })
  })

  it('unboundElements is empty when all elements are bound', () => {
    addEl(makeDataField('df8', 'name'))
    addEl(makeEraSelect('era3', 'era'))
    const { result } = renderHook(() => useBindingAnalysis())
    expect(result.current.unboundElements).toHaveLength(0)
    expect(result.current.errorElements).toHaveLength(0)
    expect(result.current.fieldMappings).toHaveLength(2)
  })
})
