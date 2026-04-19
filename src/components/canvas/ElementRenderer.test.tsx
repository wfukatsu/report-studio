import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ElementRenderer } from './ElementRenderer'
import type { TextElement } from '@/types'

function makeTextElement(content: string, id = 'el-1'): TextElement {
  return {
    id,
    type: 'text',
    position: { x: 0, y: 0 },
    size: { width: 100, height: 20 },
    zIndex: 1,
    locked: false,
    visible: true,
    content,
    style: {},
  }
}

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().invalidateComputed()
})

describe('ElementRenderer — computedValues merge', () => {
  it('passes testData to child renderer (baseline behavior unchanged)', () => {
    const element = makeTextElement('Hello {{name}}')
    render(<ElementRenderer element={element} data={{ name: 'World' }} />)
    expect(screen.getByText('Hello World')).toBeTruthy()
  })

  it('passes merged data (testData + computedValues) to child renderer', () => {
    const element = makeTextElement('Total: {{total}}')
    render(<ElementRenderer element={element} data={{ name: 'Test' }} computedValues={{ total: 1500 }} />)

    expect(screen.getByText('Total: 1500')).toBeTruthy()
  })

  it('computedValues overrides testData on key conflict', () => {
    // testData says total=999, computedValues says total=1500
    const element = makeTextElement('{{total}}')
    render(<ElementRenderer element={element} data={{ total: 999 }} computedValues={{ total: 1500 }} />)

    // computedValues wins
    expect(screen.getByText('1500')).toBeTruthy()
  })

  it('renders correctly when computedValues is empty', () => {
    // computedValues defaults to {} — no computed results set

    const element = makeTextElement('{{name}}')
    render(<ElementRenderer element={element} data={{ name: 'Alice' }} />)

    expect(screen.getByText('Alice')).toBeTruthy()
  })
})
