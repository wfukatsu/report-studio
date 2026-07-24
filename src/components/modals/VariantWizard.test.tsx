/**
 * VariantWizard — #432 破棄ガード: 編集中ドラフトを閉じる操作は確認を挟み、
 * 未編集なら即閉じる。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VariantWizard } from './VariantWizard'
import { useReportStore } from '@/store'

beforeEach(() => {
  useReportStore.getState().newReport()
})

const nameInput = () => screen.getByPlaceholderText('例: 顧客提出用、社内用')

describe('VariantWizard — #432 破棄ガード', () => {
  it('未編集なら閉じるボタンで即閉じる', () => {
    const onClose = vi.fn()
    render(<VariantWizard onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(onClose).toHaveBeenCalled()
    expect(screen.queryByText('変更を破棄')).not.toBeInTheDocument()
  })

  it('入力後に閉じると確認ダイアログを挟み、破棄で閉じる', () => {
    const onClose = vi.fn()
    render(<VariantWizard onClose={onClose} />)
    fireEvent.change(nameInput(), { target: { value: '顧客提出用' } })

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    // Not closed yet — discard confirm is showing
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('変更を破棄')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '破棄して閉じる' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('確認をキャンセルすると編集を継続できる', () => {
    const onClose = vi.fn()
    render(<VariantWizard onClose={onClose} />)
    fireEvent.change(nameInput(), { target: { value: '編集中' } })
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    // ConfirmDialog 内のキャンセル（フッターの「キャンセル」と重複するため最後の要素）
    const cancels = screen.getAllByRole('button', { name: 'キャンセル' })
    fireEvent.click(cancels[cancels.length - 1])

    expect(onClose).not.toHaveBeenCalled()
    expect(nameInput()).toHaveValue('編集中')
  })

  it('フッターのキャンセルボタンも入力後は確認を挟む', () => {
    const onClose = vi.fn()
    render(<VariantWizard onClose={onClose} />)
    fireEvent.change(nameInput(), { target: { value: '入力あり' } })

    // step 0 のフッター左ボタン（キャンセル）
    const cancels = screen.getAllByRole('button', { name: 'キャンセル' })
    fireEvent.click(cancels[0])

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('変更を破棄')).toBeInTheDocument()
  })

  it('既存バリアントの編集でも未変更なら即閉じる', () => {
    const onClose = vi.fn()
    useReportStore.getState().addVariant('社内用')
    const variant = useReportStore.getState().definition.outputVariants![0]
    render(<VariantWizard editVariant={variant} onClose={onClose} />)

    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))

    expect(onClose).toHaveBeenCalled()
  })

  it('#428: Esc でも閉じられ、入力後は破棄ガードを経由する', () => {
    const onClose = vi.fn()
    render(<VariantWizard onClose={onClose} />)

    // 未編集: Esc で即閉じ
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('#428: 入力後の Esc は確認ダイアログを挟む', () => {
    const onClose = vi.fn()
    render(<VariantWizard onClose={onClose} />)
    fireEvent.change(nameInput(), { target: { value: '編集中' } })

    fireEvent.keyDown(document, { key: 'Escape' })

    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByText('変更を破棄')).toBeInTheDocument()

    // ConfirmDialog がスタック最上位なので、もう一度 Esc すると確認だけが閉じる
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.queryByText('変更を破棄')).not.toBeInTheDocument()
    expect(nameInput()).toHaveValue('編集中')
  })
})
