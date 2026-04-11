import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { BrandColorManagerModal } from './BrandColorManagerModal'

const mockAdd = vi.fn()
const mockRemove = vi.fn()
const mockUpdate = vi.fn()

vi.mock('@/hooks/useColorPrefs', () => ({
  useBrandColors: () => ({
    colors: [
      { hex: '#E74C3C', name: 'メインレッド' },
      { hex: '#2C3E50', name: 'ネイビー' },
    ],
    add: mockAdd,
    remove: mockRemove,
    update: mockUpdate,
    isFull: false,
  }),
}))


describe('BrandColorManagerModal', () => {
  let onClose: ReturnType<typeof vi.fn>

  beforeEach(() => {
    onClose = vi.fn()
    mockAdd.mockClear()
    mockRemove.mockClear()
    mockUpdate.mockClear()
  })

  function renderModal() {
    return render(<BrandColorManagerModal onClose={onClose} />)
  }

  it('登録済みの色が表示される', () => {
    renderModal()
    expect(screen.getByText('メインレッド')).toBeInTheDocument()
    expect(screen.getByText('ネイビー')).toBeInTheDocument()
  })

  it('閉じるボタンで onClose が呼ばれる', () => {
    renderModal()
    fireEvent.click(screen.getByLabelText('閉じる'))
    expect(onClose).toHaveBeenCalled()
  })

  it('Escape キーで onClose が呼ばれる', () => {
    renderModal()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('削除ボタンで remove が呼ばれる', () => {
    renderModal()
    fireEvent.click(screen.getByLabelText('メインレッド を削除'))
    expect(mockRemove).toHaveBeenCalledWith('#E74C3C')
  })

  it('有効な HEX と名前を入力して追加できる', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('新しいカラーの HEX 値'), {
      target: { value: '#123456' },
    })
    fireEvent.change(screen.getByLabelText('新しいカラーの名前'), {
      target: { value: 'テスト色' },
    })
    fireEvent.click(screen.getByLabelText('色を追加'))
    expect(mockAdd).toHaveBeenCalledWith(expect.objectContaining({ hex: '#123456', name: 'テスト色' }))
  })

  it('不正な HEX では追加ボタンが無効', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('新しいカラーの HEX 値'), {
      target: { value: 'INVALID' },
    })
    expect(screen.getByLabelText('色を追加')).toBeDisabled()
  })

  it('Enter キーで色を追加できる', () => {
    renderModal()
    fireEvent.change(screen.getByLabelText('新しいカラーの HEX 値'), {
      target: { value: '#ABCDEF' },
    })
    fireEvent.keyDown(screen.getByLabelText('新しいカラーの HEX 値'), { key: 'Enter' })
    expect(mockAdd).toHaveBeenCalled()
  })

  it('名前をクリックすると編集モードになる', () => {
    renderModal()
    fireEvent.click(screen.getByText('メインレッド'))
    expect(screen.getByLabelText('#E74C3C の名前を編集')).toBeInTheDocument()
  })
})
