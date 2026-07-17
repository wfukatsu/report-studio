import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TextContent } from './TextContent'

describe('TextContent — style branch coverage', () => {
  it('renders text content', () => {
    const { container } = render(<TextContent text="Hello" style={{}} />)
    expect(container.textContent).toContain('Hello')
  })

  it('applies letterSpacing when set', () => {
    const { container } = render(
      <TextContent text="Text" style={{ letterSpacing: 0.1 }} />,
    )
    const inner = container.firstChild?.childNodes[0] as HTMLElement
    expect(inner.style.letterSpacing).toBe('0.1em')
  })

  it('omits letterSpacing when null', () => {
    const { container } = render(
      <TextContent text="Text" style={{ letterSpacing: undefined }} />,
    )
    const inner = container.firstChild?.childNodes[0] as HTMLElement
    expect(inner.style.letterSpacing).toBe('')
  })

  it('applies paddingTop when set', () => {
    const { container } = render(
      <TextContent text="Text" style={{ paddingTop: 2 }} />,
    )
    const inner = container.firstChild?.childNodes[0] as HTMLElement
    expect(inner.style.paddingTop).toBe('2mm')
  })

  it('applies paddingRight when set', () => {
    const { container } = render(
      <TextContent text="Text" style={{ paddingRight: 3 }} />,
    )
    const inner = container.firstChild?.childNodes[0] as HTMLElement
    expect(inner.style.paddingRight).toBe('3mm')
  })

  it('applies paddingBottom when set', () => {
    const { container } = render(
      <TextContent text="Text" style={{ paddingBottom: 4 }} />,
    )
    const inner = container.firstChild?.childNodes[0] as HTMLElement
    expect(inner.style.paddingBottom).toBe('4mm')
  })

  it('applies paddingLeft when set', () => {
    const { container } = render(
      <TextContent text="Text" style={{ paddingLeft: 1 }} />,
    )
    const inner = container.firstChild?.childNodes[0] as HTMLElement
    expect(inner.style.paddingLeft).toBe('1mm')
  })

  it('applies textAlignLast:justify when textAlign is justify', () => {
    const { container } = render(
      <TextContent text="Text" style={{ textAlign: 'justify' }} />,
    )
    const inner = container.firstChild?.childNodes[0] as HTMLElement
    expect(inner.style.textAlignLast).toBe('justify')
  })

  it('textAlignLast is not set for non-justify textAlign', () => {
    const { container } = render(
      <TextContent text="Text" style={{ textAlign: 'left' }} />,
    )
    const inner = container.firstChild?.childNodes[0] as HTMLElement
    expect(inner.style.textAlignLast).toBe('')
  })

  it('renders furigana in vertical writing mode', () => {
    const { container } = render(
      <TextContent
        text="漢字"
        style={{ writingMode: 'vertical-rl' }}
        furigana="かんじ"
      />,
    )
    // In vertical mode, furigana is positioned on the right
    const furiganaSpan = container.querySelector('span span') as HTMLElement
    expect(furiganaSpan).toBeInTheDocument()
    // right position is set for vertical mode
    expect(furiganaSpan.style.right).toBeTruthy()
    expect(furiganaSpan.style.top).toBe('')
  })

  it('renders furigana in horizontal writing mode', () => {
    const { container } = render(
      <TextContent
        text="漢字"
        style={{ writingMode: 'horizontal-tb' }}
        furigana="かんじ"
      />,
    )
    const furiganaSpan = container.querySelector('span span') as HTMLElement
    // top position is set for horizontal mode
    expect(furiganaSpan.style.top).toBeTruthy()
    expect(furiganaSpan.style.right).toBe('')
  })
})

describe('TextContent — textFit modes', () => {
  it('default (no textFit) uses overflow hidden and height 100%', () => {
    const { container } = render(<TextContent text="Hello" style={{}} />)
    const outer = container.firstChild as HTMLElement
    expect(outer.style.overflow).toBe('hidden')
    expect(outer.style.height).toBe('100%')
  })

  it('shrinkText mode uses overflow hidden and height 100%', () => {
    const { container } = render(
      <TextContent text="Hello" style={{ textFit: 'shrinkText' }} />,
    )
    const outer = container.firstChild as HTMLElement
    expect(outer.style.overflow).toBe('hidden')
    expect(outer.style.height).toBe('100%')
  })

  it('expandFrame mode uses overflow visible and height auto', () => {
    const { container } = render(
      <TextContent text="Hello" style={{ textFit: 'expandFrame' }} />,
    )
    const outer = container.firstChild as HTMLElement
    expect(outer.style.overflow).toBe('visible')
    expect(outer.style.height).toBe('auto')
  })

  it('expandFrame sets minHeight 100%', () => {
    const { container } = render(
      <TextContent text="Hello" style={{ textFit: 'expandFrame' }} />,
    )
    const outer = container.firstChild as HTMLElement
    expect(outer.style.minHeight).toBe('100%')
  })

  it('shrinkText applies base fontSize when no overflow (JSDOM)', () => {
    // In JSDOM, scrollHeight === clientHeight === 0, so no shrinking occurs
    const { container } = render(
      <TextContent text="Short" style={{ textFit: 'shrinkText', fontSize: 5 }} />,
    )
    const inner = container.firstChild?.firstChild as HTMLElement
    // Should keep original font size since JSDOM reports no overflow
    expect(inner.style.fontSize).toBe('5pt')
  })
})
