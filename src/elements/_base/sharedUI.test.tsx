import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput, IconToggle } from './sharedUI'

// Mock popover and prefs to isolate sharedUI tests
vi.mock('./ColorPickerPopover', () => ({
  ColorPickerPopover: ({ onChange, onClose }: { onChange: (v: string) => void; onClose: () => void }) => (
    <div data-testid="mock-popover">
      <button onClick={() => { onChange('#aabbcc'); onClose() }}>適用</button>
      <button onClick={onClose}>閉じる</button>
    </div>
  ),
  isValidHex: (s: string) => /^#[0-9A-Fa-f]{6}$/.test(s),
  expandHex: (s: string) => s,
}))

describe('PropSection', () => {
  it('renders with title and children', () => {
    render(
      <PropSection title="スタイル">
        <span>child content</span>
      </PropSection>
    )
    expect(screen.getByText('スタイル')).toBeInTheDocument()
    expect(screen.getByText('child content')).toBeInTheDocument()
  })

  it('renders title in uppercase (via CSS class)', () => {
    const { container } = render(
      <PropSection title="フォント">
        <div />
      </PropSection>
    )
    const titleEl = container.querySelector('p')
    expect(titleEl?.textContent).toBe('フォント')
  })
})

describe('PropRow', () => {
  it('renders with label and children', () => {
    render(
      <PropRow label="フォントサイズ">
        <input type="number" />
      </PropRow>
    )
    expect(screen.getByText('フォントサイズ')).toBeInTheDocument()
    expect(screen.getByRole('spinbutton')).toBeInTheDocument()
  })

  it('wraps in a label element', () => {
    const { container } = render(
      <PropRow label="色">
        <span />
      </PropRow>
    )
    expect(container.querySelector('label')).toBeInTheDocument()
  })
})

describe('NumInput', () => {
  it('renders a number input with the given value', () => {
    render(<NumInput value={42} onChange={vi.fn()} />)
    expect(screen.getByRole('spinbutton')).toHaveValue(42)
  })

  it('calls onChange with number when input changes', () => {
    const onChange = vi.fn()
    render(<NumInput value={10} onChange={onChange} />)
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '25' } })
    expect(onChange).toHaveBeenCalledWith(25)
  })

  it('renders unit label when unit is provided', () => {
    render(<NumInput value={10} onChange={vi.fn()} unit="mm" />)
    expect(screen.getByText('mm')).toBeInTheDocument()
  })

  it('does not render unit label when unit is not provided', () => {
    const { container } = render(<NumInput value={10} onChange={vi.fn()} />)
    const spans = container.querySelectorAll('span')
    expect(spans).toHaveLength(0)
  })

  it('respects min, max, and step props', () => {
    render(<NumInput value={5} onChange={vi.fn()} min={0} max={100} step={0.5} />)
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.min).toBe('0')
    expect(input.max).toBe('100')
    expect(input.step).toBe('0.5')
  })
})

describe('ColorInput', () => {
  it('トリガーボタンが現在の色と HEX 値を表示する', () => {
    render(<ColorInput value="#336699" onChange={vi.fn()} />)
    expect(screen.getByText('#336699')).toBeInTheDocument()
  })

  it('クリックでポップオーバーが開く', () => {
    render(<ColorInput value="#ff0000" onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('カラーピッカーを開く'))
    expect(screen.getByTestId('mock-popover')).toBeInTheDocument()
  })

  it('ポップオーバーで色を選択すると onChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(<ColorInput value="#ff0000" onChange={onChange} />)
    fireEvent.click(screen.getByLabelText('カラーピッカーを開く'))
    fireEvent.click(screen.getByText('適用'))
    expect(onChange).toHaveBeenCalledWith('#aabbcc')
  })

  it('ポップオーバーを閉じると非表示になる', () => {
    render(<ColorInput value="#ff0000" onChange={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('カラーピッカーを開く'))
    fireEvent.click(screen.getByText('閉じる'))
    expect(screen.queryByTestId('mock-popover')).not.toBeInTheDocument()
  })

  it('label prop が渡されると表示される', () => {
    render(<ColorInput value="#000000" onChange={vi.fn()} label="背景色" />)
    expect(screen.getByText('背景色')).toBeInTheDocument()
  })

  it('onReset が渡されると reset ボタンが存在する', () => {
    const onReset = vi.fn()
    render(<ColorInput value="#000000" onChange={vi.fn()} onReset={onReset} />)
    const resetBtn = screen.getByLabelText('デフォルトにリセット')
    expect(resetBtn).toBeInTheDocument()
    fireEvent.click(resetBtn)
    expect(onReset).toHaveBeenCalled()
  })
})

describe('SelectInput', () => {
  const options = [
    { value: 'left', label: '左揃え' },
    { value: 'center', label: '中央揃え' },
    { value: 'right', label: '右揃え' },
  ]

  it('renders a select with options', () => {
    render(<SelectInput value="left" onChange={vi.fn()} options={options} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('displays the selected value', () => {
    render(<SelectInput value="center" onChange={vi.fn()} options={options} />)
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('center')
  })

  it('calls onChange with new value when selection changes', () => {
    const onChange = vi.fn()
    render(<SelectInput value="left" onChange={onChange} options={options} />)
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'right' } })
    expect(onChange).toHaveBeenCalledWith('right')
  })
})

describe('IconToggle', () => {
  it('renders with children', () => {
    render(
      <IconToggle active={false} onClick={vi.fn()} title="太字">
        <span>B</span>
      </IconToggle>
    )
    expect(screen.getByText('B')).toBeInTheDocument()
  })

  it('renders with a title attribute', () => {
    render(
      <IconToggle active={false} onClick={vi.fn()} title="斜体">
        <span>I</span>
      </IconToggle>
    )
    expect(screen.getByTitle('斜体')).toBeInTheDocument()
  })

  it('calls onClick when button is clicked', () => {
    const onClick = vi.fn()
    render(
      <IconToggle active={false} onClick={onClick} title="アンダーライン">
        <span>U</span>
      </IconToggle>
    )
    fireEvent.click(screen.getByTitle('アンダーライン'))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('applies active styles when active is true', () => {
    const { container } = render(
      <IconToggle active={true} onClick={vi.fn()} title="Active">
        <span>X</span>
      </IconToggle>
    )
    const button = container.querySelector('button')!
    expect(button.className).toContain('bg-primary')
  })

  it('does not apply active styles when active is false', () => {
    const { container } = render(
      <IconToggle active={false} onClick={vi.fn()} title="Inactive">
        <span>X</span>
      </IconToggle>
    )
    const button = container.querySelector('button')!
    expect(button.className).not.toContain('bg-primary')
  })
})
