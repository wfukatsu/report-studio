import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ColorSection } from './ColorSection'

// Restore simple input behaviour so existing display-value queries still work
vi.mock('@/elements/_base/sharedUI', async (importOriginal) => {
  const mod = await importOriginal<typeof import('@/elements/_base/sharedUI')>()
  return {
    ...mod,
    ColorInput: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
    ),
  }
})

const colors = [
  { key: 'fill', label: '塗りつぶし', value: '#ffffff' },
  { key: 'stroke', label: '枠線', value: '#000000' },
]

describe('ColorSection', () => {
  it('renders with default title', () => {
    render(<ColorSection colors={colors} onChange={vi.fn()} />)
    expect(screen.getByText('配色')).toBeInTheDocument()
  })

  it('renders with custom title', () => {
    render(<ColorSection colors={colors} onChange={vi.fn()} title="カラー設定" />)
    expect(screen.getByText('カラー設定')).toBeInTheDocument()
  })

  it('renders all color entries', () => {
    render(<ColorSection colors={colors} onChange={vi.fn()} />)
    expect(screen.getByText('塗りつぶし')).toBeInTheDocument()
    expect(screen.getByText('枠線')).toBeInTheDocument()
  })

  it('calls onChange with key and value when color input changes', () => {
    const onChange = vi.fn()
    render(<ColorSection colors={colors} onChange={onChange} />)
    const colorInputs = screen.getAllByDisplayValue('#ffffff')
    fireEvent.change(colorInputs[0], { target: { value: '#ff0000' } })
    expect(onChange).toHaveBeenCalledWith('fill', '#ff0000')
  })

  it('renders empty list without error', () => {
    render(<ColorSection colors={[]} onChange={vi.fn()} />)
    expect(screen.getByText('配色')).toBeInTheDocument()
  })
})
