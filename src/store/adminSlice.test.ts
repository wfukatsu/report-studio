/**
 * adminSlice — user management + server config actions (#223).
 *
 * The API layer (@/api/reportApi) is mocked; the real store wiring runs.
 * Focus: success paths mutate state, an aborted fetch must NOT paint an error
 * banner over freshly-loaded data (#156), and genuine failures surface a message.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReportStore } from '@/store'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    listUsers: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
    getServerConfig: vi.fn(),
    putServerConfig: vi.fn(),
  }
})

import {
  listUsers,
  createUser,
  deleteUser,
  getServerConfig,
  putServerConfig,
} from '@/api/reportApi'

const USER_A = { userId: 'alice', displayName: 'Alice', roles: ['admin'] }
const USER_B = { userId: 'bob', displayName: 'Bob', roles: ['user'] }

beforeEach(() => {
  vi.clearAllMocks()
  useReportStore.setState({
    adminUsers: [],
    adminUsersLoading: false,
    adminUsersError: null,
    adminServerConfig: {},
    adminServerConfigOriginal: {},
    adminServerConfigLoading: false,
    adminServerConfigError: null,
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('adminSlice — fetchAdminUsers', () => {
  it('stores the user list and clears loading on success', async () => {
    vi.mocked(listUsers).mockResolvedValue([USER_A, USER_B] as never)
    await useReportStore.getState().fetchAdminUsers()
    expect(useReportStore.getState().adminUsers).toEqual([USER_A, USER_B])
    expect(useReportStore.getState().adminUsersLoading).toBe(false)
    expect(useReportStore.getState().adminUsersError).toBeNull()
  })

  it('surfaces an error message on an unexpected failure', async () => {
    vi.mocked(listUsers).mockRejectedValue(new Error('boom'))
    await useReportStore.getState().fetchAdminUsers()
    expect(useReportStore.getState().adminUsersError).toBe('ユーザー一覧の取得に失敗しました')
    expect(useReportStore.getState().adminUsersLoading).toBe(false)
  })

  it('does NOT set an error when the fetch was aborted (#156)', async () => {
    vi.mocked(listUsers).mockRejectedValue(new Error('aborted'))
    const controller = new AbortController()
    controller.abort()
    await useReportStore.getState().fetchAdminUsers(controller.signal)
    expect(useReportStore.getState().adminUsersError).toBeNull()
  })

  it('does NOT overwrite state when a resolved response arrives after abort', async () => {
    vi.mocked(listUsers).mockResolvedValue([USER_A] as never)
    const controller = new AbortController()
    controller.abort()
    await useReportStore.getState().fetchAdminUsers(controller.signal)
    // Aborted → the resolved users are discarded (guarded by !signal.aborted).
    expect(useReportStore.getState().adminUsers).toEqual([])
  })
})

describe('adminSlice — create/delete user', () => {
  it('appends the created user', async () => {
    useReportStore.setState({ adminUsers: [USER_A] as never })
    vi.mocked(createUser).mockResolvedValue(USER_B as never)
    await useReportStore.getState().createAdminUser({ userId: 'bob', password: 'pw' })
    expect(useReportStore.getState().adminUsers).toEqual([USER_A, USER_B])
  })

  it('removes the deleted user by id', async () => {
    useReportStore.setState({ adminUsers: [USER_A, USER_B] as never })
    vi.mocked(deleteUser).mockResolvedValue(undefined as never)
    await useReportStore.getState().deleteAdminUser('alice')
    expect(useReportStore.getState().adminUsers).toEqual([USER_B])
  })
})

describe('adminSlice — server config', () => {
  it('loads config into both current and original on fetch', async () => {
    vi.mocked(getServerConfig).mockResolvedValue({ 'db.host': 'localhost' } as never)
    await useReportStore.getState().fetchAdminServerConfig()
    expect(useReportStore.getState().adminServerConfig).toEqual({ 'db.host': 'localhost' })
    expect(useReportStore.getState().adminServerConfigOriginal).toEqual({ 'db.host': 'localhost' })
    expect(useReportStore.getState().adminServerConfigLoading).toBe(false)
  })

  it('sets an error message when the config load fails', async () => {
    vi.mocked(getServerConfig).mockRejectedValue(new Error('nope'))
    await useReportStore.getState().fetchAdminServerConfig()
    expect(useReportStore.getState().adminServerConfigError).toBe('設定の読み込みに失敗しました')
    expect(useReportStore.getState().adminServerConfigLoading).toBe(false)
  })

  it('setAdminServerConfigField merges a single key without touching others', () => {
    useReportStore.setState({ adminServerConfig: { a: '1' } })
    useReportStore.getState().setAdminServerConfigField('b', '2')
    expect(useReportStore.getState().adminServerConfig).toEqual({ a: '1', b: '2' })
  })

  it('saveAdminServerConfig persists current config and syncs the original baseline', async () => {
    useReportStore.setState({
      adminServerConfig: { a: '9' },
      adminServerConfigOriginal: { a: '1' },
    })
    vi.mocked(putServerConfig).mockResolvedValue(undefined as never)
    await useReportStore.getState().saveAdminServerConfig()
    expect(putServerConfig).toHaveBeenCalledWith({ a: '9' })
    // After a successful save the "unsaved changes" diff (current vs original) is cleared.
    expect(useReportStore.getState().adminServerConfigOriginal).toEqual({ a: '9' })
  })
})
