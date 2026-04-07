import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { DataSourcePanel } from './DataSourcePanel'

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setDataSource(null)
})

describe('DataSourcePanel — 初期状態', () => {
  it('renders in form mode by default', () => {
    render(<DataSourcePanel />)
    expect(screen.getByText('フォーム')).toBeInTheDocument()
    expect(screen.getByText('JSON')).toBeInTheDocument()
  })

  it('shows form inputs in form mode', () => {
    render(<DataSourcePanel />)
    expect(screen.getByPlaceholderText('customer.name')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('山田太郎')).toBeInTheDocument()
  })

  it('shows system variables section', () => {
    render(<DataSourcePanel />)
    expect(screen.getByText('システム変数')).toBeInTheDocument()
  })
})

describe('DataSourcePanel — フォームモード', () => {
  it('adds a new row when + フィールドを追加 is clicked', () => {
    render(<DataSourcePanel />)
    const keyInputs = screen.getAllByPlaceholderText('customer.name')
    fireEvent.click(screen.getByText('+ フィールドを追加'))
    const keyInputsAfter = screen.getAllByPlaceholderText('customer.name')
    expect(keyInputsAfter.length).toBe(keyInputs.length + 1)
  })

  it('delete row button is disabled when only 1 row', () => {
    render(<DataSourcePanel />)
    const deleteBtn = screen.getByRole('button', { name: 'この行を削除' })
    expect(deleteBtn).toBeDisabled()
  })

  it('delete row button enabled when multiple rows', () => {
    render(<DataSourcePanel />)
    fireEvent.click(screen.getByText('+ フィールドを追加'))
    const deleteBtns = screen.getAllByRole('button', { name: 'この行を削除' })
    expect(deleteBtns[0]).not.toBeDisabled()
  })

  it('removes row when delete button clicked', () => {
    render(<DataSourcePanel />)
    fireEvent.click(screen.getByText('+ フィールドを追加'))
    const beforeCount = screen.getAllByPlaceholderText('customer.name').length
    const deleteBtns = screen.getAllByRole('button', { name: 'この行を削除' })
    fireEvent.click(deleteBtns[0])
    const afterCount = screen.getAllByPlaceholderText('customer.name').length
    expect(afterCount).toBe(beforeCount - 1)
  })

  it('applies form data to store when データを適用 is clicked', () => {
    render(<DataSourcePanel />)
    const keyInput = screen.getByPlaceholderText('customer.name')
    const valueInput = screen.getByPlaceholderText('山田太郎')
    fireEvent.change(keyInput, { target: { value: 'name' } })
    fireEvent.change(valueInput, { target: { value: '鈴木' } })

    fireEvent.click(screen.getByText('データを適用'))
    const ds = useReportStore.getState().definition.dataSources[0]
    expect(ds).toBeTruthy()
    expect((ds.fields as Record<string, unknown>).name).toBe('鈴木')
  })

  it('データを適用 button is disabled when no key', () => {
    render(<DataSourcePanel />)
    const applyBtn = screen.getByText('データを適用')
    expect(applyBtn).toBeDisabled()
  })
})

describe('DataSourcePanel — JSONモード', () => {
  it('switches to JSON mode when JSON button clicked', () => {
    render(<DataSourcePanel />)
    fireEvent.click(screen.getByText('JSON'))
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('applies JSON data to store', () => {
    render(<DataSourcePanel />)
    fireEvent.click(screen.getByText('JSON'))

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{"name":"Alice"}' } })
    fireEvent.click(screen.getByText('データを適用'))

    const ds = useReportStore.getState().definition.dataSources[0]
    expect((ds.fields as Record<string, unknown>).name).toBe('Alice')
  })

  it('shows error for invalid JSON', () => {
    render(<DataSourcePanel />)
    fireEvent.click(screen.getByText('JSON'))

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{invalid json' } })
    fireEvent.click(screen.getByText('データを適用'))

    expect(screen.getByText('無効なJSON形式です')).toBeInTheDocument()
  })

  it('switches back to form mode when フォーム button clicked', () => {
    render(<DataSourcePanel />)
    fireEvent.click(screen.getByText('JSON'))
    fireEvent.click(screen.getByText('フォーム'))
    expect(screen.getByPlaceholderText('customer.name')).toBeInTheDocument()
  })
})

describe('DataSourcePanel — データソース表示とクリア', () => {
  it('shows datasource name when datasource is set', () => {
    useReportStore.getState().setDataSource({ id: 'ds-1', name: 'テストデータ', fields: { x: 1 } })
    render(<DataSourcePanel />)
    expect(screen.getByText('テストデータ')).toBeInTheDocument()
  })

  it('clears datasource when クリア is clicked', () => {
    useReportStore.getState().setDataSource({ id: 'ds-1', name: 'テストデータ', fields: { x: 1 } })
    render(<DataSourcePanel />)
    fireEvent.click(screen.getByText('クリア'))
    expect(useReportStore.getState().definition.dataSources).toHaveLength(0)
  })

  it('syncs form rows to JSON when switching to JSON mode', () => {
    render(<DataSourcePanel />)
    const keyInput = screen.getByPlaceholderText('customer.name')
    fireEvent.change(keyInput, { target: { value: 'myField' } })
    fireEvent.click(screen.getByText('JSON'))

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement
    expect(textarea.value).toContain('myField')
  })

  it('syncs JSON to form when switching to form mode', () => {
    render(<DataSourcePanel />)
    fireEvent.click(screen.getByText('JSON'))

    const textarea = screen.getByRole('textbox')
    fireEvent.change(textarea, { target: { value: '{"fieldA":"valueA"}' } })
    fireEvent.click(screen.getByText('フォーム'))

    expect(screen.getByDisplayValue('fieldA')).toBeInTheDocument()
  })
})
