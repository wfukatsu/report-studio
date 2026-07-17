import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyState } from './EmptyState'

describe('EmptyState', () => {
  it('renders the title', () => {
    render(<EmptyState title="データがありません" />)
    expect(screen.getByText('データがありません')).toBeInTheDocument()
  })

  it('renders the description only when provided', () => {
    const { rerender } = render(<EmptyState title="t" />)
    expect(screen.queryByText('説明文')).not.toBeInTheDocument()
    rerender(<EmptyState title="t" description="説明文" />)
    expect(screen.getByText('説明文')).toBeInTheDocument()
  })

  it('renders an icon when provided', () => {
    render(<EmptyState title="t" icon={<svg data-testid="empty-icon" />} />)
    expect(screen.getByTestId('empty-icon')).toBeInTheDocument()
  })

  it('renders an interactive action node', () => {
    const onClick = vi.fn()
    render(<EmptyState title="t" action={<button onClick={onClick}>再試行</button>} />)
    fireEvent.click(screen.getByRole('button', { name: '再試行' }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
