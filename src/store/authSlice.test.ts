/**
 * authSlice — login/logout/session-restore state transitions.
 *
 * API layer (@/api/reportApi) is mocked; the real store wiring is used so
 * cross-slice effects (tenant refetch after login) are verified too.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useReportStore } from '@/store'
import { ApiError, NetworkError } from '@/api/client'
import type { Me } from '@/api/reportApi'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    getMe: vi.fn(),
    login: vi.fn(),
    logout: vi.fn(),
    getTenantInfo: vi.fn(),
  }
})

import { getMe, login, logout, getTenantInfo } from '@/api/reportApi'

vi.mock('@/lib/browserNavigation', () => ({ navigateTo: vi.fn() }))
import { navigateTo } from '@/lib/browserNavigation'

const ADMIN: Me = { userId: 'admin', displayName: '管理者', roles: ['admin'], anonymous: false }

const TENANT = {
  companyName: 'Scalar株式会社', address: '東京都', phone: '03-0000-0000',
  representative: '代表', logoUrl: '', custom: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  useReportStore.setState({ currentUser: null, authLoading: true, tenantInfo: null, tenantLoading: false })
})

// ---------------------------------------------------------------------------
// checkAuth — session restore on app mount
// ---------------------------------------------------------------------------

describe('authSlice — checkAuth', () => {
  it('restores the session when /me returns a non-anonymous user', async () => {
    vi.mocked(getMe).mockResolvedValueOnce(ADMIN)

    await useReportStore.getState().checkAuth()

    const s = useReportStore.getState()
    expect(s.currentUser).toEqual(ADMIN)
    expect(s.authLoading).toBe(false)
  })

  it('treats an anonymous /me response as unauthenticated', async () => {
    vi.mocked(getMe).mockResolvedValueOnce({ userId: '', displayName: '', roles: [], anonymous: true })

    await useReportStore.getState().checkAuth()

    const s = useReportStore.getState()
    expect(s.currentUser).toBeNull()
    expect(s.authLoading).toBe(false)
  })

  it('clears currentUser and does not throw on 401', async () => {
    vi.mocked(getMe).mockRejectedValueOnce(new ApiError(401, null, 'HTTP 401'))

    await expect(useReportStore.getState().checkAuth()).resolves.toBeUndefined()

    const s = useReportStore.getState()
    expect(s.currentUser).toBeNull()
    expect(s.authLoading).toBe(false)
  })

  it('clears currentUser and does not throw on network failure (backend down)', async () => {
    vi.mocked(getMe).mockRejectedValueOnce(new NetworkError('offline'))

    await expect(useReportStore.getState().checkAuth()).resolves.toBeUndefined()
    expect(useReportStore.getState().currentUser).toBeNull()
    expect(useReportStore.getState().authLoading).toBe(false)
  })

  it('sets authLoading=true while the request is in flight', async () => {
    let resolveMe!: (me: Me) => void
    vi.mocked(getMe).mockReturnValueOnce(new Promise<Me>((r) => { resolveMe = r }))
    useReportStore.setState({ authLoading: false })

    const pending = useReportStore.getState().checkAuth()
    expect(useReportStore.getState().authLoading).toBe(true)

    resolveMe(ADMIN)
    await pending
    expect(useReportStore.getState().authLoading).toBe(false)
  })

  it('fetches tenant info after restoring a valid session', async () => {
    vi.mocked(getMe).mockResolvedValueOnce(ADMIN)
    vi.mocked(getTenantInfo).mockResolvedValueOnce(TENANT as never)

    await useReportStore.getState().checkAuth()

    expect(getTenantInfo).toHaveBeenCalledTimes(1)
    expect(useReportStore.getState().tenantInfo).toEqual(TENANT)
  })

  it('does not fetch tenant info for an anonymous session', async () => {
    vi.mocked(getMe).mockResolvedValueOnce({ userId: '', displayName: '', roles: [], anonymous: true })

    await useReportStore.getState().checkAuth()

    expect(getTenantInfo).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// loginUser
// ---------------------------------------------------------------------------

describe('authSlice — loginUser', () => {
  it('sets currentUser and refetches tenant info after a successful login', async () => {
    vi.mocked(login).mockResolvedValueOnce(ADMIN)
    vi.mocked(getTenantInfo).mockResolvedValueOnce(TENANT as never)

    await useReportStore.getState().loginUser('admin', 'secret')

    expect(login).toHaveBeenCalledWith('admin', 'secret')
    expect(useReportStore.getState().currentUser).toEqual(ADMIN)
    // Tenant info must be fetched as part of the login flow (no pre-auth mount fetch)
    expect(getTenantInfo).toHaveBeenCalledTimes(1)
    expect(useReportStore.getState().tenantInfo).toEqual(TENANT)
  })

  it('propagates login failure and leaves currentUser null', async () => {
    vi.mocked(login).mockRejectedValueOnce(new ApiError(401, null, 'HTTP 401'))

    await expect(useReportStore.getState().loginUser('admin', 'wrong')).rejects.toBeInstanceOf(ApiError)

    expect(useReportStore.getState().currentUser).toBeNull()
    expect(getTenantInfo).not.toHaveBeenCalled()
  })

  it('keeps the user logged in even when the tenant refetch fails', async () => {
    vi.mocked(login).mockResolvedValueOnce(ADMIN)
    vi.mocked(getTenantInfo).mockRejectedValueOnce(new NetworkError('offline'))
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    // fetchTenantInfo swallows its own errors, so loginUser resolves
    await expect(useReportStore.getState().loginUser('admin', 'secret')).resolves.toBeUndefined()

    expect(useReportStore.getState().currentUser).toEqual(ADMIN)
    expect(useReportStore.getState().tenantInfo).toBeNull()
    consoleError.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// logoutUser
// ---------------------------------------------------------------------------

describe('authSlice — logoutUser', () => {
  it('clears currentUser after a successful logout', async () => {
    useReportStore.setState({ currentUser: ADMIN })
    vi.mocked(logout).mockResolvedValueOnce(undefined)

    await useReportStore.getState().logoutUser()

    expect(logout).toHaveBeenCalledTimes(1)
    expect(useReportStore.getState().currentUser).toBeNull()
  })

  it('clears currentUser even when the logout request fails', async () => {
    useReportStore.setState({ currentUser: ADMIN })
    vi.mocked(logout).mockRejectedValueOnce(new NetworkError('offline'))

    // The error propagates (no catch), but local state is cleared in finally
    await expect(useReportStore.getState().logoutUser()).rejects.toBeInstanceOf(NetworkError)
    expect(useReportStore.getState().currentUser).toBeNull()
  })

  it('clears the loaded template and the user-scoped autosave draft on logout', async () => {
    useReportStore.setState({ currentUser: ADMIN, currentTemplateId: 'tpl-1' })
    localStorage.setItem('rds-autosave:admin', '{"pages":[]}')
    vi.mocked(logout).mockResolvedValueOnce(undefined)

    await useReportStore.getState().logoutUser()

    expect(useReportStore.getState().currentTemplateId).toBeNull()
    expect(localStorage.getItem('rds-autosave:admin')).toBeNull()
  })

  it('does not reset the editor when logout is called while already logged out', async () => {
    useReportStore.setState({ currentUser: null, currentTemplateId: 'tpl-1' })
    vi.mocked(logout).mockResolvedValueOnce(undefined)

    await useReportStore.getState().logoutUser()

    // No logged-in → logged-out transition: template stays untouched
    expect(useReportStore.getState().currentTemplateId).toBe('tpl-1')
  })
})

// ---------------------------------------------------------------------------
// Keycloak / OIDC (#499)
// ---------------------------------------------------------------------------

describe('authSlice — OIDC (#499)', () => {
  it('records the sign-in methods advertised by /me, even when anonymous', async () => {
    vi.mocked(getMe).mockResolvedValue({
      userId: 'anonymous', displayName: 'Anonymous User', roles: [], anonymous: true,
      provider: 'none', hasPassword: false,
      auth: { localLoginEnabled: false, oidcEnabled: true, oidcLoginUrl: '/api/v1/auth/oidc/login' },
    })
    await useReportStore.getState().checkAuth()
    expect(useReportStore.getState().currentUser).toBeNull()
    expect(useReportStore.getState().authOptions).toEqual({
      localLoginEnabled: false, oidcEnabled: true, oidcLoginUrl: '/api/v1/auth/oidc/login',
    })
  })

  it('assumes password-only login for a server that omits the auth block', async () => {
    vi.mocked(getMe).mockResolvedValue(ADMIN)
    vi.mocked(getTenantInfo).mockResolvedValue(TENANT)
    await useReportStore.getState().checkAuth()
    expect(useReportStore.getState().authOptions).toEqual({ localLoginEnabled: true, oidcEnabled: false })
  })

  it('sends the browser to the provider logout URL after an OIDC logout', async () => {
    useReportStore.setState({ currentUser: { ...ADMIN, userId: 'alice', provider: 'oidc' } })
    vi.mocked(logout).mockResolvedValue({ status: 'logged_out', logoutUrl: 'https://kc/logout?x=1' })
    await useReportStore.getState().logoutUser()
    expect(useReportStore.getState().currentUser).toBeNull()
    expect(navigateTo).toHaveBeenCalledWith('https://kc/logout?x=1')
  })

  it('does not navigate after a local logout', async () => {
    useReportStore.setState({ currentUser: ADMIN })
    vi.mocked(logout).mockResolvedValue({ status: 'logged_out' })
    await useReportStore.getState().logoutUser()
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('takes the sign-in options from a successful password login response', async () => {
    vi.mocked(login).mockResolvedValue({ ...ADMIN, auth: { localLoginEnabled: true, oidcEnabled: true, oidcLoginUrl: '/x' } })
    vi.mocked(getTenantInfo).mockResolvedValue(TENANT)
    await useReportStore.getState().loginUser('admin', 'pw')
    expect(useReportStore.getState().authOptions).toEqual({ localLoginEnabled: true, oidcEnabled: true, oidcLoginUrl: '/x' })
  })

  it('resets the editor before leaving for the provider logout', async () => {
    useReportStore.setState({ currentUser: { ...ADMIN, userId: 'alice', provider: 'oidc' } })
    const order: string[] = []
    const reset = useReportStore.getState().resetForUserSwitch
    useReportStore.setState({ resetForUserSwitch: (prev) => { order.push('reset'); reset(prev) } })
    vi.mocked(navigateTo).mockImplementation(() => { order.push('navigate') })
    vi.mocked(logout).mockResolvedValue({ status: 'logged_out', logoutUrl: 'https://kc/logout' })
    await useReportStore.getState().logoutUser()
    expect(order).toEqual(['reset', 'navigate'])
  })
})
