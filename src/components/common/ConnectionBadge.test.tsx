import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ConnectionBadge, ConnectionIndicator } from './ConnectionBadge'
import { useReportStore } from '@/store'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('ConnectionBadge', () => {
  it('renders nothing when backend is connected', () => {
    useReportStore.getState().setBackendConnected(true)
    const { container } = render(<ConnectionBadge />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the offline badge when not connected', () => {
    useReportStore.getState().setBackendConnected(false)
    render(<ConnectionBadge />)
    expect(screen.getByText('オフライン')).toBeInTheDocument()
  })

  it('has role="status" when showing offline badge', () => {
    useReportStore.getState().setBackendConnected(false)
    render(<ConnectionBadge />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has correct aria-label when offline', () => {
    useReportStore.getState().setBackendConnected(false)
    render(<ConnectionBadge />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'バックエンド未接続')
  })
})

describe('ConnectionIndicator', () => {
  it('renders without crashing', () => {
    useReportStore.getState().setBackendConnected(true)
    render(<ConnectionIndicator />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('shows connected state when backend is connected', () => {
    useReportStore.getState().setBackendConnected(true)
    render(<ConnectionIndicator />)
    expect(screen.getByText('接続中')).toBeInTheDocument()
  })

  it('shows offline state when backend is not connected', () => {
    useReportStore.getState().setBackendConnected(false)
    render(<ConnectionIndicator />)
    expect(screen.getByText('オフライン')).toBeInTheDocument()
  })

  it('has correct aria-label when connected', () => {
    useReportStore.getState().setBackendConnected(true)
    render(<ConnectionIndicator />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'バックエンド接続中')
  })

  it('has correct aria-label when not connected', () => {
    useReportStore.getState().setBackendConnected(false)
    render(<ConnectionIndicator />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', 'バックエンド未接続')
  })
})
