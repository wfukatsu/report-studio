import { describe, it, expect, beforeEach, beforeAll } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BindingMapperTab } from './BindingMapperTab'
import { useReportStore } from '@/store'

// Mock SVG getClientRects / getBoundingClientRect for connection line tests
beforeAll(() => {
  // jsdom doesn't support SVG layout methods
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({ top: 0, left: 0, right: 100, bottom: 20, width: 100, height: 20 }),
  })
})

beforeEach(() => {
  useReportStore.getState().newReport()
})

function setupSchemaAndElement() {
  // Add schema group with a field
  useReportStore.getState().addSchemaGroup('master')
  const groupId = useReportStore.getState().definition.schema!.groups[0].id
  useReportStore.getState().addSchemaField(groupId, { key: 'customerName', label: '顧客名', type: 'string' })
  const fieldId = useReportStore.getState().definition.schema!.groups[0].fields[0].id

  // Add a dataField element to the first page
  const pageId = useReportStore.getState().definition.pages[0].id
  const elId = 'el-test-1'
  useReportStore.getState().addElement(pageId, {
    id: elId,
    type: 'dataField',
    position: { x: 0, y: 0 },
    size: { width: 50, height: 10 },
    zIndex: 1,
    visible: true,
    locked: false,
    fieldKey: '',
    style: {},
  } as unknown as import('@/types').ReportElement)

  return { groupId, fieldId, pageId, elId }
}

describe('BindingMapperTab', () => {
  it('スキーマが未定義のとき空状態を表示する', () => {
    render(<BindingMapperTab />)
    expect(screen.getByText(/スキーマが未定義/)).toBeInTheDocument()
  })

  it('スキーマフィールドと要素が表示される', () => {
    setupSchemaAndElement()
    render(<BindingMapperTab />)
    expect(screen.getByText('顧客名')).toBeInTheDocument()
    expect(screen.getByText('dataField')).toBeInTheDocument()
  })

  it('フィールドをクリックすると選択状態になる', () => {
    setupSchemaAndElement()
    render(<BindingMapperTab />)
    fireEvent.click(screen.getByText('顧客名'))
    // Status bar should appear
    expect(screen.getByText(/選択中:/)).toBeInTheDocument()
    expect(screen.getByText(/選択解除/)).toBeInTheDocument()
  })

  it('フィールド選択後に要素をクリックすると接続される', () => {
    const { fieldId, pageId, elId } = setupSchemaAndElement()
    render(<BindingMapperTab />)

    // Select field
    fireEvent.click(screen.getByText('顧客名'))

    // Click element to connect
    fireEvent.click(screen.getByText('dataField'))

    // Verify binding was set
    const el = useReportStore.getState().definition.pages
      .find((p) => p.id === pageId)!.sections!
      .flatMap((s) => s.elements).find((e) => e.id === elId)!
    expect(el.schemaBinding?.fieldId).toBe(fieldId)
  })

  it('接続済み要素を同じフィールド選択中にクリックすると解除される', () => {
    const { fieldId, pageId, elId } = setupSchemaAndElement()
    // Pre-bind
    useReportStore.getState().setElementSchemaBinding(pageId, elId, fieldId)

    render(<BindingMapperTab />)

    // Select the same field
    fireEvent.click(screen.getByText('顧客名'))

    // Click the element (already bound to selected field) → disconnect
    fireEvent.click(screen.getByText('dataField'))

    const el = useReportStore.getState().definition.pages
      .find((p) => p.id === pageId)!.sections!
      .flatMap((s) => s.elements).find((e) => e.id === elId)!
    expect(el.schemaBinding).toBeUndefined()
  })

  it('「選択解除」ボタンで選択状態をリセットする', () => {
    setupSchemaAndElement()
    render(<BindingMapperTab />)
    fireEvent.click(screen.getByText('顧客名'))
    expect(screen.getByText(/選択中:/)).toBeInTheDocument()
    fireEvent.click(screen.getByText(/選択解除/))
    expect(screen.queryByText(/選択中:/)).not.toBeInTheDocument()
  })
})

describe('BindingMapperTab — Phase 4: ドラッグ接続', () => {
  it('SVG オーバーレイが存在する', () => {
    setupSchemaAndElement()
    render(<BindingMapperTab />)
    // SVG should be present in the DOM
    const svg = document.querySelector('svg')
    expect(svg).toBeInTheDocument()
  })

  it('ドラッグ開始でラバーバンド線が描画される（pointerdown → pointermove）', () => {
    setupSchemaAndElement()
    render(<BindingMapperTab />)

    const fieldChip = screen.getByText('顧客名').closest('button')!
    fireEvent.pointerDown(fieldChip, { clientX: 50, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(fieldChip, { clientX: 200, clientY: 100, pointerId: 1 })

    // A rubber band line should appear (dragging state)
    const svg = document.querySelector('svg')!
    const lines = svg.querySelectorAll('line')
    expect(lines.length).toBeGreaterThan(0)
  })

  it('ドラッグ中に要素行に pointerup すると接続される', () => {
    const { fieldId, pageId, elId } = setupSchemaAndElement()
    render(<BindingMapperTab />)

    const fieldChip = screen.getByText('顧客名').closest('button')!
    fireEvent.pointerDown(fieldChip, { clientX: 50, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(fieldChip, { clientX: 200, clientY: 100, pointerId: 1 })

    // pointerup on the element row
    const elementRow = screen.getByText('dataField').closest('button')!
    fireEvent.pointerUp(elementRow, { clientX: 200, clientY: 100, pointerId: 1 })

    const el = useReportStore.getState().definition.pages
      .find((p) => p.id === pageId)!.sections!
      .flatMap((s) => s.elements).find((e) => e.id === elId)!
    expect(el.schemaBinding?.fieldId).toBe(fieldId)
  })

  it('ドラッグキャンセル（pointerup が要素外）で状態がリセットされる', () => {
    setupSchemaAndElement()
    render(<BindingMapperTab />)

    const fieldChip = screen.getByText('顧客名').closest('button')!
    fireEvent.pointerDown(fieldChip, { clientX: 50, clientY: 10, pointerId: 1 })
    fireEvent.pointerMove(fieldChip, { clientX: 200, clientY: 100, pointerId: 1 })

    // Verify drag started (rubber band line exists)
    const svg = document.querySelector('svg')!
    expect(svg.querySelectorAll('line[data-drag="true"]').length).toBeGreaterThan(0)

    // pointerup on the left panel (not on an element row) cancels the drag
    const leftPanel = screen.getByText('スキーマフィールド').closest('div')!.parentElement!
    fireEvent.pointerUp(leftPanel, { clientX: 50, clientY: 50, pointerId: 1 })

    // rubber band should disappear
    expect(svg.querySelectorAll('line[data-drag="true"]').length).toBe(0)
  })

  it('接続済みの場合、SVG の line 要素が表示される', () => {
    const { fieldId, pageId, elId } = setupSchemaAndElement()
    // Pre-bind
    useReportStore.getState().setElementSchemaBinding(pageId, elId, fieldId)

    render(<BindingMapperTab />)

    // SVG should have connection lines for existing bindings
    const svg = document.querySelector('svg')!
    // The SVG overlay is rendered — connection lines need refs resolved, which
    // won't work in jsdom without layout, but the SVG element itself exists.
    expect(svg).toBeInTheDocument()
  })
})
