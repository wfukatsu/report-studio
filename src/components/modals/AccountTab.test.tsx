/**
 * AccountTab — password section visibility per account provider (#499).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AccountTab } from './AccountTab'
import { useReportStore } from '@/store'
import type { Me } from '@/api/reportApi'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return { ...actual, changeProfile: vi.fn() }
})
vi.mock('@/lib/browserNavigation', () => ({ navigateTo: vi.fn() }))
import { navigateTo } from '@/lib/browserNavigation'
import { fireEvent } from '@testing-library/react'

const LOCAL: Me = { userId: 'admin', displayName: '管理者', roles: ['admin'], anonymous: false, provider: 'local', hasPassword: true }
const OIDC: Me = { userId: 'alice', displayName: 'Alice', roles: ['user'], anonymous: false, provider: 'oidc', hasPassword: false }
const LEGACY: Me = { userId: 'bob', displayName: 'Bob', roles: ['user'], anonymous: false }

const OIDC_WITH_LINK = { localLoginEnabled: true, oidcEnabled: true, oidcLoginUrl: '/api/v1/auth/oidc/login', oidcLinkEnabled: true }

beforeEach(() => {
  vi.clearAllMocks()
  useReportStore.setState({ currentUser: null, authOptions: null })
})

describe('AccountTab — パスワード欄の表示', () => {
  it('offers password change for a local account', () => {
    useReportStore.setState({ currentUser: LOCAL })
    render(<AccountTab />)
    expect(screen.getByLabelText('現在のパスワード')).toBeInTheDocument()
    expect(screen.getByLabelText('新しいパスワード')).toBeInTheDocument()
  })

  it('hides password change for an OIDC-provisioned account and explains why', () => {
    useReportStore.setState({ currentUser: OIDC })
    render(<AccountTab />)
    expect(screen.queryByLabelText('現在のパスワード')).not.toBeInTheDocument()
    expect(screen.getByText(/ID プロバイダ（Keycloak）で管理されています/)).toBeInTheDocument()
    // display name stays editable
    expect(screen.getByLabelText('表示名')).toHaveValue('Alice')
  })

  it('keeps password change for a server that predates the hasPassword flag', () => {
    useReportStore.setState({ currentUser: LEGACY })
    render(<AccountTab />)
    expect(screen.getByLabelText('現在のパスワード')).toBeInTheDocument()
  })
})

describe('AccountTab — Keycloak 連携 (#499 H1)', () => {
  it('offers explicit linking to a local password account when the server allows it', () => {
    useReportStore.setState({ currentUser: LOCAL, authOptions: OIDC_WITH_LINK })
    render(<AccountTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Keycloak アカウントと連携' }))
    expect(navigateTo).toHaveBeenCalledWith('/api/v1/auth/oidc/login?link=1')
  })

  it('shows the linked state instead of the button once linked', () => {
    useReportStore.setState({ currentUser: { ...LOCAL, oidcLinked: true }, authOptions: OIDC_WITH_LINK })
    render(<AccountTab />)
    expect(screen.getByText('このアカウントは Keycloak アカウントと連携済みです')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Keycloak アカウントと連携' })).not.toBeInTheDocument()
  })

  it('hides linking when the server disables it, for OIDC accounts, and without OIDC', () => {
    useReportStore.setState({ currentUser: LOCAL, authOptions: { ...OIDC_WITH_LINK, oidcLinkEnabled: false } })
    const { unmount } = render(<AccountTab />)
    expect(screen.queryByText('Keycloak 連携')).not.toBeInTheDocument()
    unmount()
    useReportStore.setState({ currentUser: OIDC, authOptions: OIDC_WITH_LINK })
    const r2 = render(<AccountTab />)
    expect(screen.queryByText('Keycloak 連携')).not.toBeInTheDocument()
    r2.unmount()
    useReportStore.setState({ currentUser: LOCAL, authOptions: { localLoginEnabled: true, oidcEnabled: false } })
    render(<AccountTab />)
    expect(screen.queryByText('Keycloak 連携')).not.toBeInTheDocument()
  })
})
