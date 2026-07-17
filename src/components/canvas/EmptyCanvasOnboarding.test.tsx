import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { EmptyCanvasOnboarding } from './EmptyCanvasOnboarding'

describe('EmptyCanvasOnboarding', () => {
  it('renders the onboarding heading and both actions', () => {
    render(<EmptyCanvasOnboarding onOpenTemplates={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText('帳票づくりを始めましょう')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'テンプレートから始める' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '白紙のまま作る' })).toBeInTheDocument()
  })

  it('calls onOpenTemplates when the primary action is clicked', () => {
    const onOpenTemplates = vi.fn()
    render(<EmptyCanvasOnboarding onOpenTemplates={onOpenTemplates} onDismiss={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'テンプレートから始める' }))
    expect(onOpenTemplates).toHaveBeenCalledTimes(1)
  })

  it('calls onDismiss from both the blank-page action and the close button', () => {
    const onDismiss = vi.fn()
    render(<EmptyCanvasOnboarding onOpenTemplates={() => {}} onDismiss={onDismiss} />)
    fireEvent.click(screen.getByRole('button', { name: '白紙のまま作る' }))
    fireEvent.click(screen.getByRole('button', { name: 'はじめかたを閉じる' }))
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('keeps the overlay wrapper non-interactive so canvas drag-and-drop passes through', () => {
    render(<EmptyCanvasOnboarding onOpenTemplates={() => {}} onDismiss={() => {}} />)
    const region = screen.getByRole('region', { name: 'はじめかた' })
    expect(region).toHaveStyle({ pointerEvents: 'none' })
  })
})
