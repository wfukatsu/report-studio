/**
 * LoginModal — input → submit → success/failure display.
 *
 * The API layer is mocked; the real store loginUser action runs so the modal
 * is tested against the actual error-narrowing logic (isApiError + status).
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { LoginModal } from './LoginModal'
import { useReportStore } from '@/store'
import { ApiError } from '@/api/client'
import type { Me } from '@/api/reportApi'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    login: vi.fn(),
    getTenantInfo: vi.fn(),
  }
})

import { login, getTenantInfo } from '@/api/reportApi'

vi.mock('@/lib/browserNavigation', () => ({ navigateTo: vi.fn() }))
import { navigateTo } from '@/lib/browserNavigation'

const ADMIN: Me = { userId: 'admin', displayName: '管理者', roles: ['admin'], anonymous: false }

function fillAndSubmit(userId: string, password: string) {
  fireEvent.change(screen.getByLabelText('ユーザーID'), { target: { value: userId } })
  fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: password } })
  fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
  useReportStore.setState({ currentUser: null, authLoading: false, authOptions: null, tenantInfo: null, tenantLoading: false })
  vi.mocked(getTenantInfo).mockResolvedValue({} as never)
})

describe('LoginModal — 入力と送信条件', () => {
  it('renders as a blocking dialog with empty inputs and a disabled submit button', () => {
    render(<LoginModal />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'ログイン' })).toBeDisabled()
  })

  it('keeps submit disabled while userId is whitespace-only or password is empty', () => {
    render(<LoginModal />)
    const button = screen.getByRole('button', { name: 'ログイン' })

    fireEvent.change(screen.getByLabelText('ユーザーID'), { target: { value: '   ' } })
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'pw' } })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText('ユーザーID'), { target: { value: 'admin' } })
    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: '' } })
    expect(button).toBeDisabled()

    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'pw' } })
    expect(button).toBeEnabled()
  })
})

describe('LoginModal — 認証成功', () => {
  it('calls loginUser with the trimmed userId and stores the session', async () => {
    vi.mocked(login).mockResolvedValueOnce(ADMIN)
    render(<LoginModal />)

    fillAndSubmit('  admin  ', 'secret')

    await waitFor(() => {
      expect(useReportStore.getState().currentUser).toEqual(ADMIN)
    })
    expect(login).toHaveBeenCalledWith('admin', 'secret')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('disables inputs and shows progress label while the request is pending', async () => {
    let resolveLogin!: (me: Me) => void
    vi.mocked(login).mockReturnValueOnce(new Promise<Me>((r) => { resolveLogin = r }))
    render(<LoginModal />)

    fillAndSubmit('admin', 'secret')

    expect(await screen.findByRole('button', { name: 'ログイン中...' })).toBeDisabled()
    expect(screen.getByLabelText('ユーザーID')).toBeDisabled()
    expect(screen.getByLabelText('パスワード')).toBeDisabled()

    resolveLogin(ADMIN)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ログイン' })).toBeInTheDocument()
    })
  })
})

describe('LoginModal — 認証失敗の表示', () => {
  it('shows the invalid-credentials message on 401', async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiError(401, null, 'HTTP 401'))
    render(<LoginModal />)

    fillAndSubmit('admin', 'wrong')

    expect(await screen.findByRole('alert')).toHaveTextContent('ユーザー名またはパスワードが正しくありません')
    expect(useReportStore.getState().currentUser).toBeNull()
  })

  it('shows the rate-limit message on 429', async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiError(429, null, 'HTTP 429'))
    render(<LoginModal />)

    fillAndSubmit('admin', 'secret')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ログイン試行回数が多すぎます。しばらく待ってから再試行してください',
    )
  })

  it('shows a generic message with the status code for other API errors', async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiError(500, null, 'HTTP 500'))
    render(<LoginModal />)

    fillAndSubmit('admin', 'secret')

    expect(await screen.findByRole('alert')).toHaveTextContent('ログインに失敗しました (500)')
  })

  it('shows the network error message for non-API failures', async () => {
    vi.mocked(login).mockRejectedValueOnce(new TypeError('fetch failed'))
    render(<LoginModal />)

    fillAndSubmit('admin', 'secret')

    expect(await screen.findByRole('alert')).toHaveTextContent('ネットワークエラーが発生しました')
  })

  it('clears the previous error when a retry succeeds', async () => {
    vi.mocked(login)
      .mockRejectedValueOnce(new ApiError(401, null, 'HTTP 401'))
      .mockResolvedValueOnce(ADMIN)
    render(<LoginModal />)

    fillAndSubmit('admin', 'wrong')
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('パスワード'), { target: { value: 'right' } })
    fireEvent.click(screen.getByRole('button', { name: 'ログイン' }))

    await waitFor(() => {
      expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    })
    expect(useReportStore.getState().currentUser).toEqual(ADMIN)
  })
})

// ---------------------------------------------------------------------------
// Keycloak / OIDC (#499)
// ---------------------------------------------------------------------------

describe('LoginModal — OIDC (#499)', () => {
  const BOTH = { localLoginEnabled: true, oidcEnabled: true, oidcLoginUrl: '/api/v1/auth/oidc/login' }

  it('shows only the password form when the server offers no OIDC (or has not answered yet)', () => {
    useReportStore.setState({ authOptions: null })
    render(<LoginModal />)
    expect(screen.queryByRole('button', { name: 'Keycloak でログイン' })).not.toBeInTheDocument()
    expect(screen.getByLabelText('ユーザーID')).toBeInTheDocument()
  })

  it('offers a Keycloak button next to the password form and navigates to the login URL', () => {
    useReportStore.setState({ authOptions: BOTH })
    render(<LoginModal />)
    fireEvent.click(screen.getByRole('button', { name: 'Keycloak でログイン' }))
    expect(navigateTo).toHaveBeenCalledWith('/api/v1/auth/oidc/login')
    expect(screen.getByLabelText('ユーザーID')).toBeInTheDocument()
    expect(screen.getByText('または')).toBeInTheDocument()
  })

  it('hides the password form when local login is disabled', () => {
    useReportStore.setState({ authOptions: { ...BOTH, localLoginEnabled: false } })
    render(<LoginModal />)
    expect(screen.getByRole('button', { name: 'Keycloak でログイン' })).toBeInTheDocument()
    expect(screen.queryByLabelText('ユーザーID')).not.toBeInTheDocument()
    expect(screen.queryByText('または')).not.toBeInTheDocument()
  })

  it('keeps the password form when local login is "disabled" but OIDC is unavailable', () => {
    useReportStore.setState({ authOptions: { localLoginEnabled: false, oidcEnabled: false } })
    render(<LoginModal />)
    expect(screen.getByLabelText('ユーザーID')).toBeInTheDocument()
  })

  it('explains an ?oidc_error= callback failure and strips it from the URL', () => {
    useReportStore.setState({ authOptions: BOTH })
    window.history.replaceState(null, '', '/?oidc_error=user_conflict&keep=1')
    render(<LoginModal />)
    expect(screen.getByRole('alert')).toHaveTextContent('同じユーザーIDのローカルアカウントが既に存在する')
    expect(window.location.search).toBe('?keep=1')
  })

  it('maps unknown oidc_error codes to the generic provider error', () => {
    useReportStore.setState({ authOptions: { ...BOTH, localLoginEnabled: false } })
    window.history.replaceState(null, '', '/?oidc_error=something_new')
    render(<LoginModal />)
    expect(screen.getByRole('alert')).toHaveTextContent('ID プロバイダでのログインに失敗しました')
    expect(window.location.search).toBe('')
  })

  it('gives initial focus to the user-id field even though the Keycloak button comes first', () => {
    useReportStore.setState({ authOptions: BOTH })
    render(<LoginModal />)
    expect(screen.getByLabelText('ユーザーID')).toHaveFocus()
  })

  it('focuses the Keycloak button when the password form is hidden', () => {
    useReportStore.setState({ authOptions: { ...BOTH, localLoginEnabled: false } })
    render(<LoginModal />)
    expect(screen.getByRole('button', { name: 'Keycloak でログイン' })).toHaveFocus()
  })

  it('shows a callback error once, above both sign-in methods, in both mode', () => {
    useReportStore.setState({ authOptions: BOTH })
    window.history.replaceState(null, '', '/?oidc_error=no_role')
    render(<LoginModal />)
    const alerts = screen.getAllByRole('alert')
    expect(alerts).toHaveLength(1)
    expect(alerts[0].compareDocumentPosition(screen.getByRole('button', { name: 'Keycloak でログイン' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-describedby', 'login-error')
    expect(window.location.search).toBe('')
  })
})
