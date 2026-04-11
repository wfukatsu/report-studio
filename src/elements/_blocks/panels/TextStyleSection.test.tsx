import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TextStyleSection } from './TextStyleSection'
import type { TextStyle } from '@/types'

function renderSection(
  style: TextStyle = {},
  onStyleChange = vi.fn(),
  defaultStyle?: TextStyle,
) {
  return render(
    <TextStyleSection style={style} onStyleChange={onStyleChange} defaultStyle={defaultStyle} />,
  )
}

describe('TextStyleSection — toggle off (ternary else branch)', () => {
  it('clicking 太字 when already bold sets fontWeight to normal', () => {
    const onStyleChange = vi.fn()
    renderSection({ fontWeight: 'bold' }, onStyleChange)
    fireEvent.click(screen.getByTitle('太字'))
    expect(onStyleChange).toHaveBeenCalledWith({ fontWeight: 'normal' })
  })

  it('clicking 斜体 when already italic sets fontStyle to normal', () => {
    const onStyleChange = vi.fn()
    renderSection({ fontStyle: 'italic' }, onStyleChange)
    fireEvent.click(screen.getByTitle('斜体'))
    expect(onStyleChange).toHaveBeenCalledWith({ fontStyle: 'normal' })
  })

  it('clicking 下線 when already underline sets textDecoration to none', () => {
    const onStyleChange = vi.fn()
    renderSection({ textDecoration: 'underline' }, onStyleChange)
    fireEvent.click(screen.getByTitle('下線'))
    expect(onStyleChange).toHaveBeenCalledWith({ textDecoration: 'none' })
  })

  it('clicking 打ち消し線 when already line-through sets textDecoration to none', () => {
    const onStyleChange = vi.fn()
    renderSection({ textDecoration: 'line-through' }, onStyleChange)
    fireEvent.click(screen.getByTitle('打ち消し線'))
    expect(onStyleChange).toHaveBeenCalledWith({ textDecoration: 'none' })
  })
})

describe('TextStyleSection — defaultStyle fallback values', () => {
  it('shows defaultStyle.fontSize as value when style.fontSize is undefined', () => {
    renderSection({}, vi.fn(), { fontSize: 8 })
    // The NumInput should display 8 (from defaultStyle)
    expect(screen.getByDisplayValue('8')).toBeInTheDocument()
  })

  it('shows defaultStyle.color as value when style.color is undefined', () => {
    renderSection({}, vi.fn(), { color: '#ff0000' })
    const colorInputs = screen.getAllByDisplayValue('#ff0000')
    expect(colorInputs.length).toBeGreaterThan(0)
  })
})

describe('TextStyleSection — furigana input', () => {
  it('calls onFuriganaChange with undefined when input is cleared', () => {
    const onFuriganaChange = vi.fn()
    render(
      <TextStyleSection
        style={{}}
        onStyleChange={vi.fn()}
        showFurigana
        furigana="テスト"
        onFuriganaChange={onFuriganaChange}
      />,
    )
    const input = screen.getByPlaceholderText('ふりがな')
    fireEvent.change(input, { target: { value: '' } })
    // Empty string → undefined
    expect(onFuriganaChange).toHaveBeenCalledWith(undefined)
  })

  it('calls onFuriganaChange with string when input has value', () => {
    const onFuriganaChange = vi.fn()
    render(
      <TextStyleSection
        style={{}}
        onStyleChange={vi.fn()}
        showFurigana
        furigana=""
        onFuriganaChange={onFuriganaChange}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('ふりがな'), { target: { value: 'てすと' } })
    expect(onFuriganaChange).toHaveBeenCalledWith('てすと')
  })
})
