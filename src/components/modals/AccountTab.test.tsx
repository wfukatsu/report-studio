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

const LOCAL: Me = { userId: 'admin', displayName: '管理者', roles: ['admin'], anonymous: false, provider: 'local', hasPassword: true }
const OIDC: Me = { userId: 'alice', displayName: 'Alice', roles: ['user'], anonymous: false, provider: 'oidc', hasPassword: false }
const LEGACY: Me = { userId: 'bob', displayName: 'Bob', roles: ['user'], anonymous: false }

beforeEach(() => {
  useReportStore.setState({ currentUser: null })
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
