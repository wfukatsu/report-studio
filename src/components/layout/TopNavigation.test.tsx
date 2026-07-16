import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TopNavigation, type TopNavItem } from './TopNavigation'
import type { AppTab } from '@/store/types'

const DEFAULT_TABS: { id: AppTab; label: string }[] = [
  { id: 'design', label: 'デザイン' },
  { id: 'binding', label: 'バインド' },
  { id: 'templates', label: 'テンプレート管理' },
  { id: 'responses', label: '回答' },
  { id: 'databrowser', label: 'データブラウザ' },
]

const ADMIN_TABS: { id: AppTab; label: string }[] = [
  ...DEFAULT_TABS,
  { id: 'admin', label: '管理' },
]

const GROUPED_TABS: TopNavItem[] = [
  { id: 'design', label: 'デザイン' },
  { id: 'binding', label: 'バインド' },
  { kind: 'separator' },
  { id: 'templates', label: 'テンプレート管理' },
  { id: 'responses', label: '回答' },
  { id: 'databrowser', label: 'データブラウザ' },
  { kind: 'separator' },
  { id: 'admin', label: '管理' },
]

describe('TopNavigation — レンダリング', () => {
  it('5タブが表示される', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} tabs={DEFAULT_TABS} />)
    expect(screen.getByRole('tab', { name: 'デザイン' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'バインド' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'テンプレート管理' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: '回答' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'データブラウザ' })).toBeInTheDocument()
  })

  it('admin タブが tabs に含まれる場合に表示される', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} tabs={ADMIN_TABS} />)
    expect(screen.getByRole('tab', { name: '管理' })).toBeInTheDocument()
  })

  it('admin タブが tabs に含まれない場合は表示されない', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} tabs={DEFAULT_TABS} />)
    expect(screen.queryByRole('tab', { name: '管理' })).not.toBeInTheDocument()
  })

  it('アクティブタブにaria-selected=trueが設定される', () => {
    render(<TopNavigation activeTab="binding" onTabChange={vi.fn()} tabs={DEFAULT_TABS} />)
    expect(screen.getByRole('tab', { name: 'バインド' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'デザイン' })).toHaveAttribute('aria-selected', 'false')
  })

  it('アクティブタブのtabIndexが0、非アクティブは-1', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} tabs={DEFAULT_TABS} />)
    expect(screen.getByRole('tab', { name: 'デザイン' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'バインド' })).toHaveAttribute('tabindex', '-1')
  })

  it('aria-controlsが正しく設定される', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} tabs={DEFAULT_TABS} />)
    expect(screen.getByRole('tab', { name: 'デザイン' })).toHaveAttribute('aria-controls', 'top-panel-design')
    expect(screen.getByRole('tab', { name: 'バインド' })).toHaveAttribute('aria-controls', 'top-panel-binding')
  })
})

describe('TopNavigation — クリック操作', () => {
  it('タブクリックでonTabChangeが呼ばれる', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} tabs={DEFAULT_TABS} />)
    fireEvent.click(screen.getByRole('tab', { name: 'バインド' }))
    expect(onTabChange).toHaveBeenCalledWith('binding')
  })
})

describe('TopNavigation — キーボードナビゲーション', () => {
  it('ArrowRight でフォーカスが次のタブに移動する（アクティベートしない）', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} tabs={DEFAULT_TABS} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    fireEvent.keyDown(designTab, { key: 'ArrowRight' })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('Enter でタブが選択される', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} tabs={DEFAULT_TABS} />)
    const bindingTab = screen.getByRole('tab', { name: 'バインド' })
    fireEvent.keyDown(bindingTab, { key: 'Enter' })
    expect(onTabChange).toHaveBeenCalledWith('binding')
  })

  it('Space でタブが選択される', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} tabs={DEFAULT_TABS} />)
    const bindingTab = screen.getByRole('tab', { name: 'バインド' })
    fireEvent.keyDown(bindingTab, { key: ' ' })
    expect(onTabChange).toHaveBeenCalledWith('binding')
  })

  it('IME変換中(isComposing=true)はキーボードナビゲーションが無効', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} tabs={DEFAULT_TABS} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    fireEvent.keyDown(designTab, { key: 'Enter', isComposing: true })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('ArrowLeft でフォーカスが前のタブに移動する（最初のタブは最後へ折り返す）', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} tabs={DEFAULT_TABS} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    fireEvent.keyDown(designTab, { key: 'ArrowLeft' })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('Home で最初のタブにフォーカス', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="templates" onTabChange={onTabChange} tabs={DEFAULT_TABS} />)
    const templatesTab = screen.getByRole('tab', { name: 'テンプレート管理' })
    fireEvent.keyDown(templatesTab, { key: 'Home' })
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('End で最後のタブにフォーカス', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} tabs={DEFAULT_TABS} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    fireEvent.keyDown(designTab, { key: 'End' })
    expect(onTabChange).not.toHaveBeenCalled()
  })
})

describe('TopNavigation — グルーピング (separator)', () => {
  it('セパレータが role=separator として描画される', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} tabs={GROUPED_TABS} />)
    const seps = screen.getAllByRole('separator')
    expect(seps).toHaveLength(2)
    seps.forEach((s) => expect(s).toHaveAttribute('aria-orientation', 'vertical'))
  })

  it('セパレータが含まれていてもタブ数は変わらない', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} tabs={GROUPED_TABS} />)
    expect(screen.getAllByRole('tab')).toHaveLength(6)
  })

  it('セパレータはクリックしてもタブが切り替わらない', () => {
    const onTabChange = vi.fn()
    render(<TopNavigation activeTab="design" onTabChange={onTabChange} tabs={GROUPED_TABS} />)
    const sep = screen.getAllByRole('separator')[0]
    fireEvent.click(sep)
    expect(onTabChange).not.toHaveBeenCalled()
  })

  it('矢印キーナビは separator をスキップする (binding → templates)', () => {
    render(<TopNavigation activeTab="binding" onTabChange={vi.fn()} tabs={GROUPED_TABS} />)
    const bindingTab = screen.getByRole('tab', { name: 'バインド' })
    bindingTab.focus()
    fireEvent.keyDown(bindingTab, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'テンプレート管理' }))
  })

  it('左矢印キーナビは separator をスキップする (templates → binding)', () => {
    render(<TopNavigation activeTab="templates" onTabChange={vi.fn()} tabs={GROUPED_TABS} />)
    const templatesTab = screen.getByRole('tab', { name: 'テンプレート管理' })
    templatesTab.focus()
    fireEvent.keyDown(templatesTab, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: 'バインド' }))
  })

  it('End キーは末尾の管理タブまで行ける (separator は無視)', () => {
    render(<TopNavigation activeTab="design" onTabChange={vi.fn()} tabs={GROUPED_TABS} />)
    const designTab = screen.getByRole('tab', { name: 'デザイン' })
    designTab.focus()
    fireEvent.keyDown(designTab, { key: 'End' })
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: '管理' }))
  })
})
