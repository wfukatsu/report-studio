import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import * as bindingAnalysis from '@/hooks/useBindingAnalysis'
import { DataBindingOverviewPanel } from './DataBindingOverviewPanel'
import type { BindingAnalysis } from '@/hooks/useBindingAnalysis'

// ---------------------------------------------------------------------------
// Mock helper
// ---------------------------------------------------------------------------

function mockAnalysis(partial: Partial<BindingAnalysis>) {
  vi.spyOn(bindingAnalysis, 'useBindingAnalysis').mockReturnValue({
    hasDataSource: true,
    unboundElements: [],
    fieldMappings: [],
    errorElements: [],
    ...partial,
  })
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().setDataSource(null)
  vi.restoreAllMocks()
})

// ---------------------------------------------------------------------------
// Empty state (no DataSource)
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — DataSource 未設定', () => {
  it('shows empty state message when no datasource', () => {
    mockAnalysis({ hasDataSource: false })
    render(<DataBindingOverviewPanel />)
    expect(screen.getByText(/データソースが未設定/)).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Unbound section
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — 未バインドセクション', () => {
  it('shows unbound section when there are unbound elements', () => {
    mockAnalysis({
      unboundElements: [
        { elementId: 'el1', elementLabel: 'テキスト要素', pageId: 'p1', fieldKey: undefined },
      ],
    })
    render(<DataBindingOverviewPanel />)
    expect(screen.getByText(/未バインド/)).toBeInTheDocument()
    expect(screen.getByText('テキスト要素')).toBeInTheDocument()
  })

  it('hides unbound section when there are no unbound elements', () => {
    mockAnalysis({ unboundElements: [] })
    render(<DataBindingOverviewPanel />)
    expect(screen.queryByText(/未バインド/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Field mapping section
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — フィールドマッピング', () => {
  it('shows mapping section when there are mappings', () => {
    mockAnalysis({
      fieldMappings: [
        { elementId: 'el2', elementLabel: '氏名フィールド', pageId: 'p1', fieldKey: 'customer.name' },
      ],
    })
    render(<DataBindingOverviewPanel />)
    expect(screen.getByText(/マッピング/)).toBeInTheDocument()
    expect(screen.getByText('customer.name')).toBeInTheDocument()
    expect(screen.getByText('氏名フィールド')).toBeInTheDocument()
  })

  it('hides mapping section when there are no mappings', () => {
    mockAnalysis({ fieldMappings: [] })
    render(<DataBindingOverviewPanel />)
    expect(screen.queryByText(/マッピング/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Error section
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — エラーセクション', () => {
  it('shows error section when there are error elements', () => {
    mockAnalysis({
      errorElements: [
        { elementId: 'el3', elementLabel: '単価テキスト', pageId: 'p1', fieldKey: 'price' },
      ],
    })
    render(<DataBindingOverviewPanel />)
    expect(screen.getByText(/エラー/)).toBeInTheDocument()
    expect(screen.getByText('単価テキスト')).toBeInTheDocument()
  })

  it('hides error section when there are no error elements', () => {
    mockAnalysis({ errorElements: [] })
    render(<DataBindingOverviewPanel />)
    expect(screen.queryByText(/エラー/)).not.toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Click interaction
// ---------------------------------------------------------------------------

describe('DataBindingOverviewPanel — クリックで要素選択', () => {
  it('calls selectElement and setActivePage when unbound element row is clicked', () => {
    const selectElement = vi.spyOn(useReportStore.getState(), 'selectElement')
    const setActivePage = vi.spyOn(useReportStore.getState(), 'setActivePage')

    mockAnalysis({
      unboundElements: [
        { elementId: 'el-click', elementLabel: 'クリック要素', pageId: 'page-abc', fieldKey: undefined },
      ],
    })
    render(<DataBindingOverviewPanel />)
    fireEvent.click(screen.getByText('クリック要素'))
    expect(setActivePage).toHaveBeenCalledWith('page-abc')
    expect(selectElement).toHaveBeenCalledWith('el-click')
  })

  it('calls selectElement and setActivePage when error element row is clicked', () => {
    const selectElement = vi.spyOn(useReportStore.getState(), 'selectElement')
    const setActivePage = vi.spyOn(useReportStore.getState(), 'setActivePage')

    mockAnalysis({
      errorElements: [
        { elementId: 'el-err', elementLabel: 'エラー要素', pageId: 'page-xyz', fieldKey: 'bad.key' },
      ],
    })
    render(<DataBindingOverviewPanel />)
    fireEvent.click(screen.getByText('エラー要素'))
    expect(setActivePage).toHaveBeenCalledWith('page-xyz')
    expect(selectElement).toHaveBeenCalledWith('el-err')
  })
})
