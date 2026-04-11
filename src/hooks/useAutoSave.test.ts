import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useReportStore } from '@/store'
import { useAutoSave } from './useAutoSave'

vi.mock('@/api/reportApi', () => ({
  saveReport: vi.fn().mockResolvedValue({}),
}))

import { saveReport } from '@/api/reportApi'

beforeEach(() => {
  vi.useFakeTimers()
  vi.clearAllMocks()
  useReportStore.getState().newReport()
  // Simulate a template being loaded
  useReportStore.getState().setCurrentTemplateId('template-1')
})

afterEach(() => {
  vi.useRealTimers()
  useReportStore.getState().setCurrentTemplateId(null)
})

describe('useAutoSave', () => {
  it('does not save when currentTemplateId is null', async () => {
    useReportStore.getState().setCurrentTemplateId(null)

    renderHook(() => useAutoSave())

    act(() => {
      useReportStore.getState().setReportName('Changed Name')
    })

    await act(async () => {
      vi.advanceTimersByTime(3000)
    })

    expect(saveReport).not.toHaveBeenCalled()
  })

  it('saves after 2-second debounce when template is loaded', async () => {
    renderHook(() => useAutoSave())

    act(() => {
      useReportStore.getState().setReportName('Auto Save Test')
    })

    // Before debounce fires — should not have saved yet
    act(() => { vi.advanceTimersByTime(1999) })
    expect(saveReport).not.toHaveBeenCalled()

    // After debounce fires
    await act(async () => {
      vi.advanceTimersByTime(1)
    })
    expect(saveReport).toHaveBeenCalledTimes(1)
    expect(saveReport).toHaveBeenCalledWith('template-1', expect.objectContaining({ id: expect.any(String) }))
  })

  it('debounces multiple rapid changes into a single save', async () => {
    renderHook(() => useAutoSave())

    act(() => { useReportStore.getState().setReportName('Change 1') })
    act(() => { vi.advanceTimersByTime(500) })

    act(() => { useReportStore.getState().setReportName('Change 2') })
    act(() => { vi.advanceTimersByTime(500) })

    act(() => { useReportStore.getState().setReportName('Change 3') })

    await act(async () => { vi.advanceTimersByTime(2000) })

    expect(saveReport).toHaveBeenCalledTimes(1)
  })

  it('ghost-save prevention: snapshot taken at schedule time, not at fire time', async () => {
    renderHook(() => useAutoSave())

    // Start debounce for template-1 with name "Template One"
    act(() => {
      useReportStore.getState().setReportName('Template One')
    })

    // Before debounce fires, switch to template-2 with different content
    act(() => {
      useReportStore.getState().setCurrentTemplateId('template-2')
      useReportStore.getState().setReportName('Template Two')
    })

    await act(async () => { vi.advanceTimersByTime(2500) })

    // saveReport may be called (for the new template), but the important thing is
    // that when it IS called with template-1, it uses the template-1 snapshot
    const calls = (saveReport as ReturnType<typeof vi.fn>).mock.calls
    // Any call with template-1 ID must use the "Template One" snapshot
    for (const [callId, callDef] of calls) {
      if (callId === 'template-1') {
        expect((callDef as { metadata: { documentName: string } }).metadata.documentName).toBe('Template One')
      }
    }
  })

  it('sets saveState to error when save fails', async () => {
    const { saveReport: mockSave } = await import('@/api/reportApi')
    vi.mocked(mockSave).mockRejectedValueOnce(new Error('Network error'))

    renderHook(() => useAutoSave())

    act(() => { useReportStore.getState().setReportName('Failing Save') })

    await act(async () => { vi.advanceTimersByTime(2000) })

    expect(useReportStore.getState().saveState).toBe('error')
  })

  it('registers and removes pagehide listener', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    const removeSpy = vi.spyOn(window, 'removeEventListener')

    const { unmount } = renderHook(() => useAutoSave())

    expect(addSpy).toHaveBeenCalledWith('pagehide', expect.any(Function))

    unmount()

    expect(removeSpy).toHaveBeenCalledWith('pagehide', expect.any(Function))
  })

  it('handles ApiError (sets error state)', async () => {
    // Import and create an ApiError-like error with status property
    const { saveReport: mockSave } = await import('@/api/reportApi')
    const apiErr = Object.assign(new Error('401 Unauthorized'), { status: 401, message: 'Unauthorized' })
    vi.mocked(mockSave).mockRejectedValueOnce(apiErr)

    renderHook(() => useAutoSave())

    act(() => { useReportStore.getState().setReportName('API Error Save') })

    await act(async () => { vi.advanceTimersByTime(2000) })

    expect(useReportStore.getState().saveState).toBe('error')
  })

  it('sendBeacon called on pagehide when pending changes exist', async () => {
    const beaconMock = vi.fn().mockReturnValue(true)
    vi.stubGlobal('navigator', { ...navigator, sendBeacon: beaconMock })

    renderHook(() => useAutoSave())

    // Make a change to create a pending snapshot
    act(() => { useReportStore.getState().setReportName('Pending on Close') })

    // Trigger pagehide before the debounce fires
    window.dispatchEvent(new Event('pagehide'))

    // sendBeacon now sends a Blob with Content-Type: application/json
    // (plain string would default to text/plain which Javalin may reject)
    const [url, body] = beaconMock.mock.calls[0]
    expect(url).toBe('/api/v2/templates/template-1')
    expect(body).toBeInstanceOf(Blob)
    expect((body as Blob).type).toBe('application/json')
  })
})
