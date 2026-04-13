import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppShell } from './AppShell'
import { useReportStore } from '@/store'
import { MemoryRouter } from 'react-router-dom'

// App内の重いコンポーネントをモック
vi.mock('@/App', () => ({ default: () => <div data-testid="app-design" /> }))
vi.mock('@/components/tabs/DataManagementTab', () => ({
  DataManagementTab: () => <div data-testid="data-management-tab" />,
}))
vi.mock('@/components/tabs/TemplateManagementTab', () => ({
  TemplateManagementTab: () => <div data-testid="template-management-tab" />,
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

  it('未認証状態ではデータ管理タブのコンテンツが表示されない', () => {
    useReportStore.setState({ currentUser: null } as Parameters<typeof useReportStore.setState>[0])
    useReportStore.setState({ activeTab: 'data' } as Parameters<typeof useReportStore.setState>[0])
    renderAppShell()
    expect(screen.queryByTestId('data-management-tab')).not.toBeInTheDocument()
  })

  it('未認証状態ではテンプレート管理タブのコンテンツが表示されない', () => {
    useReportStore.setState({ currentUser: null } as Parameters<typeof useReportStore.setState>[0])
    useReportStore.setState({ activeTab: 'templates' } as Parameters<typeof useReportStore.setState>[0])
    renderAppShell()
    expect(screen.queryByTestId('template-management-tab')).not.toBeInTheDocument()
  })
})
