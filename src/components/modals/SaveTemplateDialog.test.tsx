import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SaveTemplateDialog } from './SaveTemplateDialog'

describe('SaveTemplateDialog', () => {
  it('renders nothing when open is false', () => {
    const { container } = render(
      <SaveTemplateDialog open={false} onSave={vi.fn()} onCancel={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('shows dialog with name input when open', () => {
    render(<SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByLabelText('テンプレート名')).toBeInTheDocument()
  })

  it('pre-fills defaultName in input', () => {
    render(
      <SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={vi.fn()} defaultName="見積書" />,
    )
    expect(screen.getByLabelText('テンプレート名')).toHaveValue('見積書')
  })

  it('disables save button when name is empty', () => {
    render(<SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={vi.fn()} defaultName="" />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('calls onSave with name when save button clicked', () => {
    const onSave = vi.fn()
    render(<SaveTemplateDialog open={true} onSave={onSave} onCancel={vi.fn()} defaultName="テスト" />)
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onSave).toHaveBeenCalledWith('テスト', undefined, undefined)
  })

  it('calls onCancel when cancel button clicked', () => {
    const onCancel = vi.fn()
    render(<SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onSave on Enter key press', () => {
    const onSave = vi.fn()
    render(<SaveTemplateDialog open={true} onSave={onSave} onCancel={vi.fn()} defaultName="テスト" />)
    fireEvent.keyDown(screen.getByLabelText('テンプレート名'), { key: 'Enter' })
    expect(onSave).toHaveBeenCalledWith('テスト', undefined, undefined)
  })

  it('shows saving state when saving is true', () => {
    render(
      <SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={vi.fn()} defaultName="テスト" saving={true} />,
    )
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled()
  })
})

describe('SaveTemplateDialog — #432 破棄ガード', () => {
  it('入力を変更した後のキャンセルは確認ダイアログを挟む', () => {
    const onCancel = vi.fn()
    render(<SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={onCancel} defaultName="" />)
    fireEvent.change(screen.getByLabelText('テンプレート名'), { target: { value: '新しい見積書' } })

    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    // Not closed yet — the discard confirm is showing instead
    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByText('変更を破棄')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '破棄して閉じる' }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('確認をキャンセルすると編集を継続できる', () => {
    const onCancel = vi.fn()
    render(<SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={onCancel} defaultName="" />)
    fireEvent.change(screen.getByLabelText('テンプレート名'), { target: { value: '編集中' } })
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))

    // ConfirmDialog's own cancel button — scope to the inner dialog to avoid
    // matching the SaveTemplateDialog cancel button
    const buttons = screen.getAllByRole('button', { name: 'キャンセル' })
    fireEvent.click(buttons[buttons.length - 1])

    expect(onCancel).not.toHaveBeenCalled()
    expect(screen.getByLabelText('テンプレート名')).toHaveValue('編集中')
  })

  it('未編集ならキャンセルで即閉じる', () => {
    const onCancel = vi.fn()
    render(<SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={onCancel} defaultName="テスト" />)
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalled()
    expect(screen.queryByText('変更を破棄')).not.toBeInTheDocument()
  })
})
