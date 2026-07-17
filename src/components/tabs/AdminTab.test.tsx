import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { AdminTab } from './AdminTab'
import type { Me } from '@/api/reportApi'

// Section components are integration-heavy (API + store); stub them so this
// test focuses on the tab's own behavior: gating and section switching.
vi.mock('@/components/admin/UserManagement', () => ({
  UserManagement: () => <div>STUB-USER-MANAGEMENT</div>,
}))
vi.mock('@/components/admin/ServerSettings', () => ({
  ServerSettings: () => <div>STUB-SERVER-SETTINGS</div>,
}))
vi.mock('@/components/admin/TenantSettings', () => ({
  TenantSettings: () => <div>STUB-TENANT-SETTINGS</div>,
}))
vi.mock('@/components/admin/DefaultStyleSettings', () => ({
  DefaultStyleSettings: () => <div>STUB-STYLE-SETTINGS</div>,
}))
vi.mock('@/components/tabs/TemplateManagementTab', () => ({
  TemplateManagementTab: () => <div>STUB-TEMPLATES</div>,
}))

const ADMIN: Me = { userId: 'admin', displayName: '管理者', roles: ['admin', 'user'], anonymous: false }
const PLAIN_USER: Me = { userId: 'user1', displayName: 'ユーザー1', roles: ['user'], anonymous: false }

beforeEach(() => {
  useReportStore.setState({ backendConnected: true, currentUser: ADMIN } as never)
})

describe('AdminTab — access gating', () => {
  it('asks to start the backend when disconnected', () => {
    useReportStore.setState({ backendConnected: false } as never)
    render(<AdminTab />)
    expect(screen.getByText('バックエンドに接続されていません')).toBeInTheDocument()
    expect(screen.queryByText('STUB-USER-MANAGEMENT')).not.toBeInTheDocument()
  })

  it('requires the admin role', () => {
    useReportStore.setState({ currentUser: PLAIN_USER } as never)
    render(<AdminTab />)
    expect(screen.getByText('管理者権限が必要です')).toBeInTheDocument()
    expect(screen.queryByText('STUB-USER-MANAGEMENT')).not.toBeInTheDocument()
  })

  it('treats a missing user as non-admin', () => {
    useReportStore.setState({ currentUser: null } as never)
    render(<AdminTab />)
    expect(screen.getByText('管理者権限が必要です')).toBeInTheDocument()
  })
})

describe('AdminTab — section navigation', () => {
  it('shows user management by default with the nav item marked active', () => {
    render(<AdminTab />)
    expect(screen.getByText('STUB-USER-MANAGEMENT')).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: '管理セクション' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ユーザー管理' }).className).toContain('border-primary')
    expect(screen.getByRole('button', { name: 'サーバー設定' }).className).not.toContain('border-primary')
  })

  it('switches sections when a nav item is clicked', () => {
    render(<AdminTab />)
    fireEvent.click(screen.getByRole('button', { name: 'サーバー設定' }))
    expect(screen.getByText('STUB-SERVER-SETTINGS')).toBeInTheDocument()
    expect(screen.queryByText('STUB-USER-MANAGEMENT')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'サーバー設定' }).className).toContain('border-primary')
  })

  it('renders every section through the nav', () => {
    render(<AdminTab />)
    const expectations: [string, string][] = [
      ['テナント情報', 'STUB-TENANT-SETTINGS'],
      ['デフォルトスタイル', 'STUB-STYLE-SETTINGS'],
      ['テンプレート', 'STUB-TEMPLATES'],
      ['ユーザー管理', 'STUB-USER-MANAGEMENT'],
    ]
    for (const [label, stub] of expectations) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(screen.getByText(stub)).toBeInTheDocument()
    }
  })
})
