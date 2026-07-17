/**
 * tenantSlice — fetchTenantInfo / updateTenantInfo behavior.
 *
 * API layer (@/api/reportApi) is mocked; the real store wiring is used.
 * Focus: pre-login 401/403 must NOT be logged as errors (#107), while
 * genuinely unexpected failures still surface to the console.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReportStore } from '@/store'
import { ApiError, NetworkError } from '@/api/client'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    getTenantInfo: vi.fn(),
    putTenantInfo: vi.fn(),
  }
})

import { getTenantInfo, putTenantInfo } from '@/api/reportApi'

const TENANT = {
  companyName: 'Scalar株式会社', address: '東京都', phone: '03-0000-0000',
  representative: '代表', logoUrl: '', custom: {},
}

beforeEach(() => {
  vi.clearAllMocks()
  useReportStore.setState({ tenantInfo: null, tenantLoading: false })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('tenantSlice — fetchTenantInfo', () => {
  it('stores tenant info on success and clears loading', async () => {
    vi.mocked(getTenantInfo).mockResolvedValue(TENANT)
    await useReportStore.getState().fetchTenantInfo()
    expect(useReportStore.getState().tenantInfo).toEqual(TENANT)
    expect(useReportStore.getState().tenantLoading).toBe(false)
  })

  it('does NOT log an error when unauthenticated (401)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getTenantInfo).mockRejectedValue(new ApiError(401, null, 'HTTP 401: Unauthorized'))
    await useReportStore.getState().fetchTenantInfo()
    expect(spy).not.toHaveBeenCalled()
    expect(useReportStore.getState().tenantLoading).toBe(false)
  })

  it('does NOT log an error when forbidden (403)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getTenantInfo).mockRejectedValue(new ApiError(403, null, 'HTTP 403: Forbidden'))
    await useReportStore.getState().fetchTenantInfo()
    expect(spy).not.toHaveBeenCalled()
  })

  it('logs unexpected failures (e.g. 500) to the console', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getTenantInfo).mockRejectedValue(new ApiError(500, null, 'HTTP 500: Server Error'))
    await useReportStore.getState().fetchTenantInfo()
    expect(spy).toHaveBeenCalled()
    expect(useReportStore.getState().tenantLoading).toBe(false)
  })

  it('logs network failures to the console', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(getTenantInfo).mockRejectedValue(new NetworkError('offline'))
    await useReportStore.getState().fetchTenantInfo()
    expect(spy).toHaveBeenCalled()
  })
})

describe('tenantSlice — updateTenantInfo', () => {
  it('stores the updated tenant returned by the API', async () => {
    const updated = { ...TENANT, companyName: '更新後株式会社' }
    vi.mocked(putTenantInfo).mockResolvedValue(updated)
    await useReportStore.getState().updateTenantInfo(TENANT)
    expect(useReportStore.getState().tenantInfo).toEqual(updated)
  })
})
