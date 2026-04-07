import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { EditorStatusBar } from './EditorStatusBar'
import { useReportStore } from '@/store'

beforeEach(() => {
  useReportStore.getState().newReport()
})

function renderStatusBar() {
  const containerRef = { current: null } as React.RefObject<HTMLDivElement | null>
  return render(<EditorStatusBar containerRef={containerRef} />)
}

describe('EditorStatusBar', () => {
  it('renders without crashing', () => {
    renderStatusBar()
    expect(screen.getByText('エディタ')).toBeInTheDocument()
  })

  it('shows placeholder text when no element is selected', () => {
    renderStatusBar()
    expect(screen.getByText('要素を選択してください')).toBeInTheDocument()
  })

  it('renders the ZoomControl component', () => {
    renderStatusBar()
    expect(screen.getByLabelText('拡大率')).toBeInTheDocument()
  })

  it('shows element position and size when an element is selected', () => {
    const state = useReportStore.getState()
    const pageId = state.definition.pages[0].id
    const element = {
      id: 'el-test',
      type: 'text' as const,
      position: { x: 10.5, y: 20.3 },
      size: { width: 80.0, height: 15.5 },
      content: 'Test',
      style: {},
    }
    useReportStore.getState().addElement(pageId, element)
    useReportStore.getState().selectElement('el-test')

    renderStatusBar()

    expect(screen.getByText('X: 10.5 mm')).toBeInTheDocument()
    expect(screen.getByText('Y: 20.3 mm')).toBeInTheDocument()
    expect(screen.getByText('W: 80.0 mm')).toBeInTheDocument()
    expect(screen.getByText('H: 15.5 mm')).toBeInTheDocument()
  })

  it('hides the placeholder when an element is selected', () => {
    const state = useReportStore.getState()
    const pageId = state.definition.pages[0].id
    const element = {
      id: 'el-test2',
      type: 'text' as const,
      position: { x: 5.0, y: 5.0 },
      size: { width: 40.0, height: 10.0 },
      content: 'Test',
      style: {},
    }
    useReportStore.getState().addElement(pageId, element)
    useReportStore.getState().selectElement('el-test2')

    renderStatusBar()

    expect(screen.queryByText('要素を選択してください')).not.toBeInTheDocument()
  })

  it('does not show element info when multiple elements are selected', () => {
    const state = useReportStore.getState()
    const pageId = state.definition.pages[0].id
    const el1 = {
      id: 'el-a',
      type: 'text' as const,
      position: { x: 10.0, y: 10.0 },
      size: { width: 50.0, height: 10.0 },
      content: 'A',
      style: {},
    }
    const el2 = {
      id: 'el-b',
      type: 'text' as const,
      position: { x: 20.0, y: 20.0 },
      size: { width: 50.0, height: 10.0 },
      content: 'B',
      style: {},
    }
    useReportStore.getState().addElement(pageId, el1)
    useReportStore.getState().addElement(pageId, el2)
    useReportStore.getState().selectElement('el-a')
    useReportStore.getState().selectElement('el-b', true)

    renderStatusBar()

    expect(screen.getByText('要素を選択してください')).toBeInTheDocument()
  })
})
