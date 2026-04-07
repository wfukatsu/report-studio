import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SaveStatusIndicator } from './SaveStatusIndicator'
import { useReportStore } from '@/store'

beforeEach(() => {
  useReportStore.getState().newReport()
  // Reset saveState to idle
  useReportStore.getState().setSaveState('idle')
})

describe('SaveStatusIndicator', () => {
  it('renders nothing when saveState is idle', () => {
    const { container } = render(<SaveStatusIndicator />)
    expect(container.firstChild).toBeNull()
  })

  it('shows "保存中..." when saveState is saving', () => {
    useReportStore.getState().setSaveState('saving')
    render(<SaveStatusIndicator />)
    expect(screen.getByText('保存中...')).toBeInTheDocument()
  })

  it('shows "保存済み" when saveState is saved', () => {
    useReportStore.getState().setSaveState('saved')
    render(<SaveStatusIndicator />)
    expect(screen.getByText('保存済み')).toBeInTheDocument()
  })

  it('shows "保存失敗" when saveState is error', () => {
    useReportStore.getState().setSaveState('error')
    render(<SaveStatusIndicator />)
    expect(screen.getByText('保存失敗')).toBeInTheDocument()
  })

  it('has role="status" when not idle', () => {
    useReportStore.getState().setSaveState('saved')
    render(<SaveStatusIndicator />)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('has aria-label set to the save state label', () => {
    useReportStore.getState().setSaveState('saving')
    render(<SaveStatusIndicator />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-label', '保存中...')
  })

  it('has aria-live="polite" for accessibility', () => {
    useReportStore.getState().setSaveState('error')
    render(<SaveStatusIndicator />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
  })
})
