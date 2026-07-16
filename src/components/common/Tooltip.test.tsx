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

  it('cancels pending show when click happens before delay elapses', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={400}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!
    fireEvent.mouseEnter(wrapper)
    fireEvent.click(wrapper)
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('hides tooltip on click after it has been shown', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={50}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!
    fireEvent.mouseEnter(wrapper)
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.click(wrapper)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('hides tooltip on dragstart (HTML5 drag does not fire mouseleave reliably)', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={50}>
        <button draggable>Drag</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Drag').closest('span')!
    fireEvent.mouseEnter(wrapper)
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    fireEvent.dragStart(wrapper)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('hides tooltip when window scrolls', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={50}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!
    fireEvent.mouseEnter(wrapper)
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await act(async () => {
      window.dispatchEvent(new Event('scroll'))
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('hides tooltip when Escape is pressed', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={50}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!
    fireEvent.mouseEnter(wrapper)
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(screen.getByRole('tooltip')).toBeInTheDocument()
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('cancels pending show timer when mouse leaves before the delay elapses', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={400}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!
    fireEvent.mouseEnter(wrapper)
    fireEvent.mouseLeave(wrapper)
    await act(async () => { vi.advanceTimersByTime(1000) })
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    vi.useRealTimers()
  })

  it('does not leak a second timer when show is called twice without an intervening hide', async () => {
    vi.useFakeTimers()
    render(
      <Tooltip content="ヒント" delay={400}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!
    fireEvent.mouseEnter(wrapper)
    fireEvent.focus(wrapper)
    await act(async () => { vi.advanceTimersByTime(800) })
    // Tooltip should appear exactly once, not twice
    expect(screen.getAllByRole('tooltip')).toHaveLength(1)
    vi.useRealTimers()
  })

  it('does not setVisible after unmount when a show timer is pending', async () => {
    vi.useFakeTimers()
    const { unmount } = render(
      <Tooltip content="ヒント" delay={400}>
        <button>Hover</button>
      </Tooltip>,
    )
    const wrapper = screen.getByText('Hover').closest('span')!
    fireEvent.mouseEnter(wrapper)
    unmount()
    // Advance past the delay; if the timer was not cancelled, React would warn
    // about a state update on an unmounted component.
    await act(async () => { vi.advanceTimersByTime(1000) })
    vi.useRealTimers()
  })

  it('does not block click handlers on child elements', async () => {
    vi.useFakeTimers()
    const onClick = vi.fn()
    render(
      <Tooltip content="ヒント" delay={50}>
        <button onClick={onClick}>Click target</button>
      </Tooltip>,
    )
    const btn = screen.getByText('Click target')
    fireEvent.mouseEnter(btn.closest('span')!)
    await act(async () => { vi.advanceTimersByTime(100) })
    fireEvent.click(btn)
    expect(onClick).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
