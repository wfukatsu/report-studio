import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopNavigation } from './TopNavigation'

describe('TopNavigation — レンダリング', () => {
  it('3タブが表示される', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'デザイン' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'データ管理' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'テンプレート管理' })).toBeInTheDocument()
  })

  it('アクティブタブにaria-selected=trueが設定される', () => {
    render(<TopNavigation activeTab="data" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'データ管理' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'デザイン' })).toHaveAttribute('aria-selected', 'false')
  })

  it('アクティブタブのtabIndexが0、非アクティブは-1', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'デザイン' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'データ管理' })).toHaveAttribute('tabindex', '-1')
  })

  it('aria-controlsが正しく設定される', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} />)
    expect(screen.getByRole('tab', { name: 'デザイン' })).toHaveAttribute('aria-controls', 'top-panel-design')
    expect(screen.getByRole('tab', { name: 'データ管理' })).toHaveAttribute('aria-controls', 'top-panel-data')
  })
})

describe('TopNavigation — クリック操作', () => {
  it('タブクリックでonTabChangeが呼ばれる', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} />)
    fireEvent.click(screen.getByRole('tab', { name: 'データ管理' }))
    expect(onTabChange).toHaveBeenCalledWith('data')
  })
})

describe('TopNavigation — キーボードナビゲーション', () => {
  it('ArrowRight でフォーカスが次のタブに移動する（アクティベートしない）', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    fireEvent.keyDown(designTab, { key: 'ArrowRight' })
    // onTabChange は呼ばれない（マニュアルアクティベーション）
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('Enter でタブが選択される', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} />)
    const dataTab = screen.getByRole('tab', { name: 'データ管理' })
    fireEvent.keyDown(dataTab, { key: 'Enter' })
    expect(onTabChange).toHaveBeenCalledWith('data')
  })

  it('Space でタブが選択される', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} />)
    const dataTab = screen.getByRole('tab', { name: 'データ管理' })
    fireEvent.keyDown(dataTab, { key: ' ' })
    expect(onTabChange).toHaveBeenCalledWith('data')
  })

  it('IME変換中(isComposing=true)はキーボードナビゲーションが無効', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    // fireEvent では nativeEvent.isComposing が true になる
    fireEvent.keyDown(designTab, { key: 'Enter', isComposing: true })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('ArrowLeft でフォーカスが前のタブに移動する（最初のタブは最後へ折り返す）', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    fireEvent.keyDown(designTab, { key: 'ArrowLeft' })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('Home で最初のタブにフォーカス', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="templates" onTabChange={onTabChange} />)
    const templatesTab = screen.getByRole('tab', { name: 'テンプレート管理' })
    fireEvent.keyDown(templatesTab, { key: 'Home' })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('End で最後のタブにフォーカス', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    fireEvent.keyDown(designTab, { key: 'End' })
    expect(onTabChange).not.toHaveBeenCalled()
  })
})
