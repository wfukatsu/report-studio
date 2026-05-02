import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ApiError, NetworkError } from '@/api/client'
import { InlineErrorBanner } from './InlineErrorBanner'

describe('InlineErrorBanner', () => {
  it('renders user-facing copy without HTTP status for an ApiError', () => {
    render(<InlineErrorBanner error={new ApiError(503, null, 'HTTP 503: Service Unavailable')} />)
    expect(screen.getByText('バックエンドに接続できません')).toBeInTheDocument()
    expect(screen.queryByText(/HTTP/)).not.toBeInTheDocument()
    expect(screen.queryByText(/503/)).not.toBeInTheDocument()
  })

  it('renders the network copy for NetworkError', () => {
    render(<InlineErrorBanner error={new NetworkError('offline')} />)
    expect(screen.getByText('ネットワークに接続できません')).toBeInTheDocument()
  })

  it('shows a retry button for retryable errors and calls onRetry on click', () => {
    const onRetry = vi.fn()
    render(<InlineErrorBanner error={new ApiError(503, null, 'HTTP 503')} onRetry={onRetry} />)
    const btn = screen.getByRole('button', { name: '再試行' })
    fireEvent.click(btn)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('hides the retry button for non-retryable errors', () => {
    render(<InlineErrorBanner error={new ApiError(403, null, 'HTTP 403')} onRetry={vi.fn()} />)
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument()
  })

  it('falls back to unknown for non-Error inputs', () => {
    render(<InlineErrorBanner error={'something opaque'} />)
    expect(screen.getByText('予期しないエラーが発生しました')).toBeInTheDocument()
  })

  it('accepts a pre-classified UserFacingError without re-classifying', () => {
    render(
      <InlineErrorBanner
        error={{ code: 'forbidden', retryable: false }}
        onRetry={vi.fn()}
      />,
    )
    expect(screen.getByText('この操作の権限がありません')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '再試行' })).not.toBeInTheDocument()
  })

  it('exposes role=alert for assistive tech', () => {
    render(<InlineErrorBanner error={new NetworkError('x')} />)
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
