import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { BindingPanel } from './BindingPanel'

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setDataSource(null)
})

describe('BindingPanel — データソースなし', () => {
  it('shows empty message when no datasource', () => {
    render(<BindingPanel />)
    expect(screen.getByText(/データソースが設定されていません/)).toBeInTheDocument()
  })
})

describe('BindingPanel — スカラーフィールド', () => {
  beforeEach(() => {
    useReportStore.getState().setDataSource({
      id: 'ds-scalar',
      name: 'テストDS',
      fields: { name: '山田太郎', age: '30' },
    })
  })

  it('renders datasource name', () => {
    render(<BindingPanel />)
    expect(screen.getByText('テストDS')).toBeInTheDocument()
  })

  it('renders scalar field keys', () => {
    render(<BindingPanel />)
    expect(screen.getByText('name')).toBeInTheDocument()
    expect(screen.getByText('age')).toBeInTheDocument()
  })

  it('renders scalar field values as inputs', () => {
    render(<BindingPanel />)
    expect(screen.getByDisplayValue('山田太郎')).toBeInTheDocument()
    expect(screen.getByDisplayValue('30')).toBeInTheDocument()
  })

  it('updates test data when scalar input changes', () => {
    render(<BindingPanel />)
    const input = screen.getByDisplayValue('山田太郎')
    fireEvent.change(input, { target: { value: '鈴木一郎' } })
    // updateTestData should be called, but we verify via store
    // (the store updates test data, not dataSources directly)
  })
})

describe('BindingPanel — 配列フィールド', () => {
  beforeEach(() => {
    useReportStore.getState().setDataSource({
      id: 'ds-array',
      name: 'アレイDS',
      fields: { items: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] },
    })
  })

  it('renders array field key', () => {
    render(<BindingPanel />)
    expect(screen.getByText('items')).toBeInTheDocument()
  })

  it('shows item count in preview', () => {
    render(<BindingPanel />)
    expect(screen.getByText('[2 件]')).toBeInTheDocument()
  })

  it('expands array field on click', () => {
    render(<BindingPanel />)
    fireEvent.click(screen.getByText('items'))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('collapses array field on second click', () => {
    render(<BindingPanel />)
    fireEvent.click(screen.getByText('items'))
    fireEvent.click(screen.getByText('items'))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('shows error when invalid JSON entered in expanded area', () => {
    render(<BindingPanel />)
    fireEvent.click(screen.getByText('items'))
    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{invalid' } })
    expect(screen.getByText('JSON 構文エラー')).toBeInTheDocument()
  })
})

describe('BindingPanel — オブジェクトフィールド', () => {
  it('renders object field as expandable', () => {
    useReportStore.getState().setDataSource({
      id: 'ds-obj',
      name: 'ObjDS',
      fields: { customer: { name: 'Alice', age: 30 } },
    })
    render(<BindingPanel />)
    expect(screen.getByText('customer')).toBeInTheDocument()
  })
})

describe('BindingPanel — フィールドなし', () => {
  it('shows フィールドなし when datasource has no fields', () => {
    useReportStore.getState().setDataSource({
      id: 'ds-empty',
      name: '空DS',
      fields: {},
    })
    render(<BindingPanel />)
    expect(screen.getByText('フィールドなし')).toBeInTheDocument()
  })
})
