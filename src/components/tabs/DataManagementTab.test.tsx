import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { useDataBrowserStore } from '@/store/dataBrowserStore'
import { DataManagementTab } from './DataManagementTab'

// Panels are integration-heavy — stub them so the test verifies the tab's
// own responsibility: section switching wired to the store.
vi.mock('@/components/sidebar/SchemaPanel', () => ({
  SchemaPanel: () => <div>STUB-SCHEMA</div>,
}))
vi.mock('@/components/sidebar/DataSourcePanel', () => ({
  DataSourcePanel: () => <div>STUB-DATASOURCE</div>,
}))
vi.mock('@/components/sidebar/ResponsesPanel', () => ({
  ResponsesPanel: () => <div>STUB-RESPONSES</div>,
}))
vi.mock('@/components/modals/CalculationTab', () => ({
  CalculationTab: () => <div>STUB-CALCULATION</div>,
}))
vi.mock('@/components/modals/ValidationTab', () => ({
  ValidationTab: () => <div>STUB-VALIDATION</div>,
}))
vi.mock('@/components/dataBrowser/DataSourceTree', () => ({
  DataSourceTree: () => <div>STUB-SOURCE-TREE</div>,
}))
vi.mock('@/components/dataBrowser/DataGrid', () => ({
  DataGrid: () => <div>STUB-DATA-GRID</div>,
}))

beforeEach(() => {
  useReportStore.setState({ dataActiveSection: 'datasource' } as never)
  useDataBrowserStore.setState({ selectedSource: null })
})

describe('DataManagementTab — section switching', () => {
  it('shows the data source panel by default', () => {
    render(<DataManagementTab />)
    expect(screen.getByText('STUB-DATASOURCE')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'データソース' }).className).toContain('border-primary')
  })

  it('renders each section when its nav item is clicked and persists to the store', () => {
    render(<DataManagementTab />)
    const cases: [string, string, string][] = [
      ['スキーマ定義', 'STUB-SCHEMA', 'schema'],
      ['計算フィールド', 'STUB-CALCULATION', 'calculation'],
      ['バリデーション', 'STUB-VALIDATION', 'validation'],
      ['回答フィールド', 'STUB-RESPONSES', 'responses'],
    ]
    for (const [label, stub, sectionId] of cases) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByText(stub)).toBeInTheDocument()
      expect(useReportStore.getState().dataActiveSection).toBe(sectionId)
    }
    // Previous section content is unmounted
    expect(screen.queryByText('STUB-DATASOURCE')).not.toBeInTheDocument()
  })

  it('restores the active section from the store', () => {
    useReportStore.setState({ dataActiveSection: 'validation' } as never)
    render(<DataManagementTab />)
    expect(screen.getByText('STUB-VALIDATION')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'バリデーション' }).className).toContain('border-primary')
  })
})

describe('DataManagementTab — embedded data browser', () => {
  it('shows the tree with a placeholder when no source is selected', () => {
    render(<DataManagementTab />)
    fireEvent.click(screen.getByRole('button', { name: 'データブラウザ' }))
    expect(screen.getByText('STUB-SOURCE-TREE')).toBeInTheDocument()
    expect(screen.getByText('データソースを選択してください')).toBeInTheDocument()
    expect(screen.queryByText('STUB-DATA-GRID')).not.toBeInTheDocument()
  })

  it('shows the grid when a source is selected in the data browser store', () => {
    useDataBrowserStore.setState({
      selectedSource: { kind: 'scalardb-table', namespace: 'sales', table: 'orders' },
    })
    render(<DataManagementTab />)
    fireEvent.click(screen.getByRole('button', { name: 'データブラウザ' }))
    expect(screen.getByText('STUB-DATA-GRID')).toBeInTheDocument()
    expect(screen.queryByText('データソースを選択してください')).not.toBeInTheDocument()
  })
})
