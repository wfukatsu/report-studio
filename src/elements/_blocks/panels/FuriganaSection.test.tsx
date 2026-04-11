import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { FuriganaSection } from './FuriganaSection'

describe('FuriganaSection', () => {
  it('renders the enabled checkbox', () => {
    render(<FuriganaSection enabled={false} onEnabledChange={vi.fn()} />)
    expect(screen.getByRole('checkbox')).toBeInTheDocument()
    expect(screen.getByText('ふりがな欄を表示')).toBeInTheDocument()
  })

  it('checkbox is checked when enabled=true', () => {
    render(<FuriganaSection enabled onEnabledChange={vi.fn()} />)
    expect(screen.getByRole('checkbox')).toBeChecked()
  })

  it('calls onEnabledChange when checkbox is toggled', () => {
    const onEnabledChange = vi.fn()
    render(<FuriganaSection enabled={false} onEnabledChange={onEnabledChange} />)
    fireEvent.click(screen.getByRole('checkbox'))
    expect(onEnabledChange).toHaveBeenCalledWith(true)
  })

  it('does not show ratio and dataSource inputs when disabled', () => {
    render(
      <FuriganaSection
        enabled={false}
        onEnabledChange={vi.fn()}
        onRatioChange={vi.fn()}
        onDataSourceChange={vi.fn()}
      />,
    )
    expect(screen.queryByText('高さ割合')).not.toBeInTheDocument()
    expect(screen.queryByText('ふりがなデータソース')).not.toBeInTheDocument()
  })

  it('shows ratio and dataSource inputs when enabled', () => {
    render(
      <FuriganaSection
        enabled
        onEnabledChange={vi.fn()}
        ratio={0.35}
        onRatioChange={vi.fn()}
        dataSource="name.furigana"
        onDataSourceChange={vi.fn()}
      />,
    )
    expect(screen.getByText('高さ割合')).toBeInTheDocument()
    expect(screen.getByText('ふりがなデータソース')).toBeInTheDocument()
  })

  it('calls onDataSourceChange when input changes', () => {
    const onDataSourceChange = vi.fn()
    render(
      <FuriganaSection
        enabled
        onEnabledChange={vi.fn()}
        dataSource=""
        onDataSourceChange={onDataSourceChange}
      />,
    )
    const input = screen.getByPlaceholderText('フィールドキー')
    fireEvent.change(input, { target: { value: 'person.furigana' } })
    expect(onDataSourceChange).toHaveBeenCalledWith('person.furigana')
  })
})
