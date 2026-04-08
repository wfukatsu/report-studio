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
    expect(onSave).toHaveBeenCalledWith('テスト')
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
    expect(onSave).toHaveBeenCalledWith('テスト')
  })

  it('shows saving state when saving is true', () => {
    render(
      <SaveTemplateDialog open={true} onSave={vi.fn()} onCancel={vi.fn()} defaultName="テスト" saving={true} />,
    )
    expect(screen.getByRole('button', { name: '保存中...' })).toBeDisabled()
  })
})
