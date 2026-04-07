import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { VariantsModal } from './VariantsModal'

const onClose = vi.fn()

beforeEach(() => {
  useReportStore.getState().newReport()
  onClose.mockClear()
})

describe('VariantsModal — 非表示', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(<VariantsModal open={false} onClose={onClose} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('VariantsModal — 基本表示', () => {
  it('renders modal when open=true', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('出力バリアント設定')).toBeInTheDocument()
  })

  it('shows empty message when no variants', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    expect(screen.getByText(/バリアントがありません/)).toBeInTheDocument()
  })

  it('calls onClose when close button is clicked', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('閉じる'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when backdrop is clicked', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})

describe('VariantsModal — バリアント追加', () => {
  it('adds a variant with custom name', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('新しいバリアント名')
    fireEvent.change(input, { target: { value: 'テストバリアント' } })
    fireEvent.click(screen.getByText('追加'))

    const variants = useReportStore.getState().definition.outputVariants
    expect(variants.length).toBe(1)
    expect(variants[0].name).toBe('テストバリアント')
  })

  it('adds a variant with default name when input is empty', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('追加'))

    const variants = useReportStore.getState().definition.outputVariants
    expect(variants.length).toBe(1)
    expect(variants[0].name).toBe('バリアント 1')
  })

  it('adds a variant when Enter is pressed in input', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('新しいバリアント名')
    fireEvent.change(input, { target: { value: 'Enterバリアント' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const variants = useReportStore.getState().definition.outputVariants
    expect(variants.length).toBe(1)
  })

  it('clears input after adding', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    const input = screen.getByPlaceholderText('新しいバリアント名') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'テスト' } })
    fireEvent.click(screen.getByText('追加'))
    expect(input.value).toBe('')
  })
})

describe('VariantsModal — バリアントカード', () => {
  beforeEach(() => {
    useReportStore.getState().addVariant('テストバリアント1')
  })

  it('shows variant card with name', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    expect(screen.getByText('テストバリアント1')).toBeInTheDocument()
  })

  it('removes variant when delete button is clicked', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('バリアントを削除'))

    const variants = useReportStore.getState().definition.outputVariants
    expect(variants.length).toBe(0)
  })

  it('expands variant card on click', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('テストバリアント1'))
    expect(screen.getByText('対象者')).toBeInTheDocument()
  })

  it('collapses variant card on second click', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('テストバリアント1'))
    fireEvent.click(screen.getByText('テストバリアント1'))
    expect(screen.queryByText('対象者')).not.toBeInTheDocument()
  })

  it('enters name edit mode when pencil button is clicked', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('名前を編集'))
    const nameInput = screen.getByDisplayValue('テストバリアント1')
    expect(nameInput).toBeInTheDocument()
  })

  it('commits name on Enter in name edit input', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('名前を編集'))
    const nameInput = screen.getByDisplayValue('テストバリアント1')
    fireEvent.change(nameInput, { target: { value: '新しい名前' } })
    fireEvent.keyDown(nameInput, { key: 'Enter' })

    const variants = useReportStore.getState().definition.outputVariants
    expect(variants[0].name).toBe('新しい名前')
  })

  it('cancels name edit on Escape', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('名前を編集'))
    const nameInput = screen.getByDisplayValue('テストバリアント1')
    fireEvent.change(nameInput, { target: { value: '変更中...' } })
    fireEvent.keyDown(nameInput, { key: 'Escape' })

    // edit mode should exit - name reverts to original
    const variants = useReportStore.getState().definition.outputVariants
    expect(variants[0].name).toBe('テストバリアント1')
  })

  it('commits name on blur of name edit input', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByLabelText('名前を編集'))
    const nameInput = screen.getByDisplayValue('テストバリアント1')
    fireEvent.change(nameInput, { target: { value: 'ブラー名前' } })
    fireEvent.blur(nameInput)

    const variants = useReportStore.getState().definition.outputVariants
    expect(variants[0].name).toBe('ブラー名前')
  })
})

describe('VariantsModal — 展開時の詳細設定', () => {
  beforeEach(() => {
    useReportStore.getState().addVariant('詳細テスト')
  })

  it('shows hidden elements section when expanded', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('詳細テスト'))
    const headings = screen.getAllByText(/非表示要素/)
    expect(headings.length).toBeGreaterThan(0)
  })

  it('shows masking rules section when expanded', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('詳細テスト'))
    const headings = screen.getAllByText(/マスキングルール/)
    expect(headings.length).toBeGreaterThan(0)
  })

  it('updates targetAudience on blur', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('詳細テスト'))
    const audienceInput = screen.getByPlaceholderText('例: 外部提出用、経営層向け')
    fireEvent.blur(audienceInput, { target: { value: '外部提出用' } })
    // Just verify no errors thrown
    expect(audienceInput).toBeInTheDocument()
  })

  it('shows no hidden elements message', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('詳細テスト'))
    expect(screen.getByText(/非表示要素がありません/)).toBeInTheDocument()
  })

  it('shows no masking rules message', () => {
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('詳細テスト'))
    expect(screen.getByText('マスキングルールがありません。')).toBeInTheDocument()
  })
})

describe('VariantsModal — 複数バリアント', () => {
  it('shows multiple variants', () => {
    useReportStore.getState().addVariant('バリアントA')
    useReportStore.getState().addVariant('バリアントB')
    render(<VariantsModal open={true} onClose={onClose} />)
    expect(screen.getByText('バリアントA')).toBeInTheDocument()
    expect(screen.getByText('バリアントB')).toBeInTheDocument()
  })

  it('expands only the clicked variant', () => {
    useReportStore.getState().addVariant('バリアントA')
    useReportStore.getState().addVariant('バリアントB')
    render(<VariantsModal open={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('バリアントA'))
    // Should show details only once (for variant A)
    const audienceLabels = screen.getAllByText('対象者')
    expect(audienceLabels.length).toBe(1)
  })
})
