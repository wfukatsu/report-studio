import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BindingMapperTab } from './BindingMapperTab'
import { useReportStore } from '@/store'

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
