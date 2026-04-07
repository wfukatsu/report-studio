import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ZoomControl } from './ZoomControl'
import { useReportStore } from '@/store'
import { ZOOM_MIN, ZOOM_MAX } from '@/config/constants'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('ZoomControl', () => {
  it('renders without crashing', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} />)
    expect(screen.getByLabelText('拡大率')).toBeInTheDocument()
  })

  it('displays the current zoom as a percentage', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={1.5} onSetZoom={onSetZoom} />)
    const input = screen.getByLabelText('拡大率') as HTMLInputElement
    expect(input.value).toBe('150%')
  })

  it('calls onSetZoom with decreased value when zoom-out button is clicked', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} />)
    fireEvent.click(screen.getByTitle('ズームアウト'))
    expect(onSetZoom).toHaveBeenCalledWith(expect.any(Number))
    const calledWith = onSetZoom.mock.calls[0][0] as number
    expect(calledWith).toBeCloseTo(0.9, 5)
  })

  it('calls onSetZoom with increased value when zoom-in button is clicked', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} />)
    fireEvent.click(screen.getByTitle('ズームイン'))
    const calledWith = onSetZoom.mock.calls[0][0] as number
    expect(calledWith).toBeCloseTo(1.1, 5)
  })

  it('disables zoom-out button when at minimum zoom', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={ZOOM_MIN} onSetZoom={onSetZoom} />)
    expect(screen.getByTitle('ズームアウト')).toBeDisabled()
  })

  it('disables zoom-in button when at maximum zoom', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={ZOOM_MAX} onSetZoom={onSetZoom} />)
    expect(screen.getByTitle('ズームイン')).toBeDisabled()
  })

  it('opens the dropdown when the chevron button is clicked', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} />)
    const chevronBtn = screen.getByRole('button', { name: '' })
    // Find the expand button by aria-haspopup
    const expandBtn = screen.getByRole('button', { expanded: false })
    fireEvent.click(expandBtn)
    // Preset options should appear
    expect(screen.getByText('25%')).toBeInTheDocument()
    expect(screen.getByText('100%')).toBeInTheDocument()
    expect(screen.getByText('200%')).toBeInTheDocument()
  })

  it('calls onSetZoom when a preset is selected from dropdown', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} />)
    const expandBtn = screen.getByRole('button', { expanded: false })
    fireEvent.click(expandBtn)
    fireEvent.click(screen.getByText('50%'))
    expect(onSetZoom).toHaveBeenCalledWith(0.5)
  })

  it('commits input value on Enter key press', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} />)
    const input = screen.getByLabelText('拡大率')
    fireEvent.focus(input)
    fireEvent.change(input, { target: { value: '75' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSetZoom).toHaveBeenCalledWith(expect.any(Number))
    const calledWith = onSetZoom.mock.calls[0][0] as number
    expect(calledWith).toBeCloseTo(0.75, 5)
  })

  it('does not show fit buttons when containerRef or page is not provided', () => {
    const onSetZoom = vi.fn()
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} />)
    const expandBtn = screen.getByRole('button', { expanded: false })
    fireEvent.click(expandBtn)
    expect(screen.queryByTitle('横幅フィット')).not.toBeInTheDocument()
    expect(screen.queryByTitle('ページ全体フィット')).not.toBeInTheDocument()
  })

  it('shows fit buttons when containerRef and page are provided', () => {
    const onSetZoom = vi.fn()
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
    const containerRef = { current: el }

    const page = useReportStore.getState().definition.pages[0]
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} containerRef={containerRef} page={page} />)

    const expandBtn = screen.getByRole('button', { expanded: false })
    fireEvent.click(expandBtn)

    expect(screen.getByTitle('横幅フィット')).toBeInTheDocument()
    expect(screen.getByTitle('ページ全体フィット')).toBeInTheDocument()
  })

  it('calls onSetZoom with fitWidth when 横幅フィット is clicked', () => {
    const onSetZoom = vi.fn()
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
    const containerRef = { current: el }

    const page = useReportStore.getState().definition.pages[0]
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} containerRef={containerRef} page={page} />)

    const expandBtn = screen.getByRole('button', { expanded: false })
    fireEvent.click(expandBtn)
    fireEvent.click(screen.getByTitle('横幅フィット'))

    expect(onSetZoom).toHaveBeenCalledWith(expect.any(Number))
    expect(screen.queryByTitle('横幅フィット')).not.toBeInTheDocument() // dropdown closed
  })

  it('calls onSetZoom with fitPage when ページ全体フィット is clicked', () => {
    const onSetZoom = vi.fn()
    const el = document.createElement('div')
    Object.defineProperty(el, 'clientWidth', { value: 800, configurable: true })
    Object.defineProperty(el, 'clientHeight', { value: 600, configurable: true })
    const containerRef = { current: el }

    const page = useReportStore.getState().definition.pages[0]
    render(<ZoomControl zoom={1.0} onSetZoom={onSetZoom} containerRef={containerRef} page={page} />)

    const expandBtn = screen.getByRole('button', { expanded: false })
    fireEvent.click(expandBtn)
    fireEvent.click(screen.getByTitle('ページ全体フィット'))

    expect(onSetZoom).toHaveBeenCalledWith(expect.any(Number))
  })
})
