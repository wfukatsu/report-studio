import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { Tooltip } from './Tooltip'

describe('Tooltip', () => {
  it('renders children when content is empty string', () => {
    render(
      <Tooltip content="">
        <button>Click me</button>
      </Tooltip>,
    )
    expect(screen.getByText('Click me')).toBeInTheDocument()
    // No tooltip wrapper (content is falsy)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders children when content is null/undefined', () => {
    render(
      <Tooltip content={null}>
        <button>No tooltip</button>
      </Tooltip>,
    )
    expect(screen.getByText('No tooltip')).toBeInTheDocument()
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('renders children with wrapper span when content is provided', () => {
    render(
      <Tooltip content="ヒントテキスト">
        <button>Hover me</button>
      </Tooltip>,
    )
    expect(screen.getByText('Hover me')).toBeInTheDocument()
    // Tooltip is hidden initially
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('shows tooltip after mouseenter delay', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={400}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!
    fireEvent.mouseEnter(wrapper)

    // Tooltip not shown yet
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    // Advance timer
    await act(async () => { vi.advanceTimersByTime(500) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByRole('tooltip').textContent).toBe('ヒント')

    vi.useRealTimers()
  })

  it('hides tooltip on mouseleave', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={100}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!

    fireEvent.mouseEnter(wrapper)
    await act(async () => { vi.advanceTimersByTime(200) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.mouseLeave(wrapper)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('shows tooltip on focus', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="フォーカスヒント" delay={0}>
        <button>Focus me</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Focus me').closest('span')!
    fireEvent.focus(wrapper)
    await act(async () => { vi.advanceTimersByTime(10) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()

    fireEvent.blur(wrapper)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    vi.useRealTimers()
  })

  it('applies custom className to wrapper span', () => {
    render(
      <Tooltip content="hint" className="my-custom-class">
        <button>Child</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Child').closest('span')!
    expect(wrapper.className).toContain('my-custom-class')
  })

  it('renders with placement=top prop without crashing', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="上ヒント" placement="top" delay={0}>
        <button>Top</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Top').closest('span')!
    fireEvent.mouseEnter(wrapper)
    await act(async () => { vi.advanceTimersByTime(10) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    vi.useRealTimers()
  })
})
