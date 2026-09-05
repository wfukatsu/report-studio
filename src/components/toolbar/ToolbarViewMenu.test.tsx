import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToolbarViewMenu, type ToolbarViewMenuProps } from './ToolbarViewMenu'

function setup(over: Partial<ToolbarViewMenuProps> = {}) {
  const props: ToolbarViewMenuProps = {
    showGrid: false, toggleGrid: vi.fn(),
    snapToGrid: false, toggleSnapToGrid: vi.fn(),
    showTrimMarks: false, toggleTrimMarks: vi.fn(),
    showMarginGuide: false, toggleMarginGuide: vi.fn(),
    headerEditMode: false, toggleHeaderEditMode: vi.fn(),
    canEditHeaderFooter: true,
    hasMasterHeader: false, onToggleMasterHeader: vi.fn(),
    hasMasterFooter: false, onToggleMasterFooter: vi.fn(),
    ...over,
  }
  render(<ToolbarViewMenu {...props} />)
  return props
}

const open = () => fireEvent.click(screen.getByRole('button', { name: '表示オプション' }))

describe('ToolbarViewMenu', () => {
  it('keeps advanced tools hidden until opened', () => {
    setup()
    expect(screen.queryByRole('menuitemcheckbox', { name: 'グリッドを表示' })).not.toBeInTheDocument()
    open()
    expect(screen.getByRole('menuitemcheckbox', { name: 'グリッドを表示' })).toBeInTheDocument()
  })

  it('invokes the matching handler for each toggle', () => {
    const props = setup()
    open()
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'グリッドを表示' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'トンボを表示' }))
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: '余白ガイドを表示' }))
    expect(props.toggleGrid).toHaveBeenCalledTimes(1)
    expect(props.toggleTrimMarks).toHaveBeenCalledTimes(1)
    expect(props.toggleMarginGuide).toHaveBeenCalledTimes(1)
  })

  it('reflects active state via aria-checked', () => {
    setup({ showGrid: true })
    open()
    expect(screen.getByRole('menuitemcheckbox', { name: 'グリッドを表示' })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemcheckbox', { name: 'トンボを表示' })).toHaveAttribute('aria-checked', 'false')
  })

  it('disables header/footer edit when no master exists', () => {
    setup({ canEditHeaderFooter: false })
    open()
    expect(screen.getByRole('menuitemcheckbox', { name: 'ヘッダー/フッター編集モード' })).toBeDisabled()
  })

  it('labels the master header item by presence', () => {
    setup({ hasMasterHeader: true })
    open()
    expect(screen.getByRole('menuitemcheckbox', { name: 'マスターヘッダーを削除' })).toBeInTheDocument()
  })

  describe('trigger button look (#498)', () => {
    const trigger = () => screen.getByRole('button', { name: '表示オプション' })

    it('is not filled when closed even if an option is ON — shows a dot instead', () => {
      setup({ showMarginGuide: true })
      expect(trigger()).not.toHaveClass('bg-primary')
      expect(trigger()).toHaveAttribute('aria-expanded', 'false')
      expect(screen.getByTestId('toolbar-indicator-dot')).toBeInTheDocument()
    })

    it('shows no dot when every option is OFF', () => {
      setup()
      expect(trigger()).not.toHaveClass('bg-primary')
      expect(screen.queryByTestId('toolbar-indicator-dot')).not.toBeInTheDocument()
    })

    it('is filled only while the menu is open, and hides the dot meanwhile', () => {
      setup({ showGrid: true })
      open()
      expect(trigger()).toHaveClass('bg-primary')
      expect(trigger()).toHaveAttribute('aria-expanded', 'true')
      expect(screen.queryByTestId('toolbar-indicator-dot')).not.toBeInTheDocument()
    })
  })
})
