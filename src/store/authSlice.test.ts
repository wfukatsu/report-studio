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
