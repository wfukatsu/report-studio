import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'
import { useReportStore } from '@/store'
import { MemoryRouter } from 'react-router-dom'

// App内の重いコンポーネントをモック
vi.mock('@/App', () => ({ default: () => <div data-testid="app-design" /> }))
vi.mock('@/components/bindingEditor/BindingEditor', () => ({
  BindingEditor: () => <div data-testid="binding-editor" />,
}))
vi.mock('@/components/tabs/TemplateManagementTab', () => ({
  TemplateManagementTab: () => <div data-testid="template-management-tab" />,
}))
vi.mock('@/components/sidebar/ResponsesPanel', () => ({
  ResponsesPanel: () => <div data-testid="responses-panel" />,
}))
vi.mock('@/components/dataBrowser/DataSourceTree', () => ({
  DataSourceTree: () => <div data-testid="data-source-tree" />,
}))
vi.mock('@/components/dataBrowser/DataGrid', () => ({
  DataGrid: () => <div data-testid="data-grid" />,
}))
vi.mock('@/components/dataBrowser/EmptyState', () => ({
  EmptyState: () => <div data-testid="empty-state" />,
}))
vi.mock('@/hooks/useConnectionState', () => ({ useConnectionState: vi.fn() }))

function renderAppShell() {
  return render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  )
}

describe('AppShell — タブ切り替え', () => {
  it('デフォルトでデザインタブのコンテンツが表示される', () => {
    renderAppShell()
    expect(screen.getByTestId('app-design')).toBeInTheDocument()
  })

  it('バインドタブでBindingEditorが表示される', () => {
    useReportStore.setState({ activeTab: 'binding' } as Parameters<typeof useReportStore.setState>[0])
    renderAppShell()
    expect(screen.getByTestId('binding-editor')).toBeInTheDocument()
  })

  it('テンプレート管理タブのコンテンツが表示される', () => {
    useReportStore.setState({ activeTab: 'templates' } as Parameters<typeof useReportStore.setState>[0])
    renderAppShell()
    expect(screen.getByTestId('template-management-tab')).toBeInTheDocument()
  })
})
