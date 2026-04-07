import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PropSection, PropRow, NumInput, ColorInput, SelectInput, IconToggle } from './sharedUI'

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
  it('renders color and text inputs', () => {
    render(<ColorInput value="#ff0000" onChange={vi.fn()} />)
    const inputs = screen.getAllByRole('textbox')
    expect(inputs.length).toBeGreaterThanOrEqual(1)
  })

  it('displays the current color value', () => {
    render(<ColorInput value="#336699" onChange={vi.fn()} />)
    const textInput = screen.getByRole('textbox') as HTMLInputElement
    expect(textInput.value).toBe('#336699')
  })

  it('calls onChange when text input changes', () => {
    const onChange = vi.fn()
    render(<ColorInput value="#000000" onChange={onChange} />)
    const textInput = screen.getByRole('textbox')
    fireEvent.change(textInput, { target: { value: '#ffffff' } })
    expect(onChange).toHaveBeenCalledWith('#ffffff')
  })

  it('renders optional label when provided', () => {
    render(<ColorInput value="#000000" onChange={vi.fn()} label="背景色" />)
    expect(screen.getByText('背景色')).toBeInTheDocument()
  })

  it('does not render label when not provided', () => {
    const { container } = render(<ColorInput value="#000000" onChange={vi.fn()} />)
    const spans = container.querySelectorAll('span')
    expect(spans).toHaveLength(0)
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
