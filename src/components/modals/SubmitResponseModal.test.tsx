import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useReportStore } from '@/store'
import { SubmitResponseModal } from './SubmitResponseModal'

vi.mock('@/api/reportApi', () => ({
  submitResponse: vi.fn(),
}))

import { submitResponse } from '@/api/reportApi'
const mockSubmit = vi.mocked(submitResponse)

function openModal(templateId = 'tpl-1', testData: Record<string, unknown> = { name: 'Alice' }) {
  useReportStore.setState({ currentTemplateId: templateId, testData } as never)
  useReportStore.getState().openSubmitResponseModal()
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().closeSubmitResponseModal()
  vi.clearAllMocks()
})

describe('SubmitResponseModal — 非表示', () => {
  it('renders nothing when modal is closed', () => {
    const { container } = render(<SubmitResponseModal />)
    expect(container.firstChild).toBeNull()
  })
})

describe('SubmitResponseModal — 基本表示', () => {
  it('renders the dialog when open', () => {
    openModal()
    render(<SubmitResponseModal />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('回答を送信')).toBeInTheDocument()
  })

  it('lists testData key-value pairs', () => {
    openModal('tpl-1', { company: 'Acme', amount: 100 })
    render(<SubmitResponseModal />)
    expect(screen.getByText('company')).toBeInTheDocument()
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('amount')).toBeInTheDocument()
  })

  it('shows empty state when testData has no entries', () => {
    openModal('tpl-1', {})
    render(<SubmitResponseModal />)
    expect(screen.getByText(/データがありません/)).toBeInTheDocument()
  })

  it('disables submit button when no data entries', () => {
    openModal('tpl-1', {})
    render(<SubmitResponseModal />)
    expect(screen.getByRole('button', { name: /送信/ })).toBeDisabled()
  })
})

describe('SubmitResponseModal — 送信', () => {
  it('calls submitResponse on confirm and shows success state', async () => {
    mockSubmit.mockResolvedValueOnce({ id: 'r1' } as never)
    openModal()
    render(<SubmitResponseModal />)
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))
    await waitFor(() => expect(screen.getByText('回答を送信しました')).toBeInTheDocument())
    expect(mockSubmit).toHaveBeenCalledWith('tpl-1', expect.objectContaining({ name: 'Alice' }))
  })

  it('shows error message when submitResponse throws', async () => {
    mockSubmit.mockRejectedValueOnce(new Error('Network error'))
    openModal()
    render(<SubmitResponseModal />)
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network error'))
  })

  it('invalidates responses cache on successful submit', async () => {
    mockSubmit.mockResolvedValueOnce({ id: 'r1' } as never)
    useReportStore.getState().setResponses([], 0) // stamp a non-zero cacheTime via a manual set
    useReportStore.setState({ responsesCacheTime: 999 } as never)
    openModal()
    render(<SubmitResponseModal />)
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))
    await waitFor(() => expect(screen.getByText('回答を送信しました')).toBeInTheDocument())
    expect(useReportStore.getState().responsesCacheTime).toBe(0)
  })
})

describe('SubmitResponseModal — 閉じる', () => {
  it('closes via cancel button', () => {
    openModal()
    render(<SubmitResponseModal />)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(useReportStore.getState().submitResponseModalOpen).toBe(false)
  })

  it('closes via X button', () => {
    openModal()
    render(<SubmitResponseModal />)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(useReportStore.getState().submitResponseModalOpen).toBe(false)
  })

  it('resets submitted state when closed after success', async () => {
    mockSubmit.mockResolvedValueOnce({ id: 'r1' } as never)
    openModal()
    const { unmount } = render(<SubmitResponseModal />)
    fireEvent.click(screen.getByRole('button', { name: /送信/ }))
    await waitFor(() => screen.getByText('回答を送信しました'))
    // Use the footer close button (not the X icon)
    const closeButtons = screen.getAllByRole('button', { name: '閉じる' })
    fireEvent.click(closeButtons[closeButtons.length - 1])
    expect(useReportStore.getState().submitResponseModalOpen).toBe(false)
    unmount()

    // Re-open: should show form, not success state
    useReportStore.getState().openSubmitResponseModal()
    render(<SubmitResponseModal />)
    expect(screen.queryByText('回答を送信しました')).toBeNull()
  })
})
