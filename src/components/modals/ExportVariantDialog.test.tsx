import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ExportVariantDialog } from './ExportVariantDialog'
import type { OutputVariant } from '@/types'

const onSelect = vi.fn()
const onCancel = vi.fn()

beforeEach(() => {
  useReportStore.getState().newReport()
  onSelect.mockClear()
  onCancel.mockClear()
})

describe('ExportVariantDialog — 非表示', () => {
  it('renders nothing when open=false', () => {
    const { container } = render(
      <ExportVariantDialog open={false} onSelect={onSelect} onCancel={onCancel} />,
    )
    expect(container.firstChild).toBeNull()
  })
})

describe('ExportVariantDialog — 基本表示', () => {
  it('renders dialog when open=true', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('PDF出力バリアント')).toBeInTheDocument()
  })

  it('shows "none" option', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    expect(screen.getByText('なし（すべて表示）')).toBeInTheDocument()
  })

  it('shows empty variants message when no variants', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    expect(screen.getByText('バリアントがありません。')).toBeInTheDocument()
  })

  it('calls onCancel when cancel button is clicked', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    fireEvent.click(screen.getByLabelText('キャンセル'))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('calls onCancel when backdrop is clicked', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })
})

describe('ExportVariantDialog — なし選択', () => {
  it('calls onSelect(null) when "なし" option is clicked', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('なし（すべて表示）'))
    expect(onSelect).toHaveBeenCalledWith(null)
  })
})

describe('ExportVariantDialog — バリアントあり', () => {
  beforeEach(() => {
    useReportStore.getState().addVariant('テスト出力')
  })

  it('shows variant name in list', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    expect(screen.getByText('テスト出力')).toBeInTheDocument()
  })

  it('calls onSelect with variant when variant button is clicked', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('テスト出力'))
    expect(onSelect).toHaveBeenCalledTimes(1)
    const arg = onSelect.mock.calls[0][0] as OutputVariant
    expect(arg).not.toBeNull()
    expect(arg.name).toBe('テスト出力')
  })

  it('does not show empty variants message', () => {
    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    expect(screen.queryByText('バリアントがありません。')).not.toBeInTheDocument()
  })
})

describe('ExportVariantDialog — targetAudience表示', () => {
  it('shows targetAudience when variant has it', () => {
    useReportStore.getState().addVariant('対象者テスト')
    const store = useReportStore.getState()
    const variant = store.definition.outputVariants[0]
    store.updateVariant(variant.id, { targetAudience: '外部提出用' })

    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    expect(screen.getByText('外部提出用')).toBeInTheDocument()
  })
})

describe('ExportVariantDialog — 複数バリアント', () => {
  it('shows all variants in list', () => {
    useReportStore.getState().addVariant('バリアントA')
    useReportStore.getState().addVariant('バリアントB')
    useReportStore.getState().addVariant('バリアントC')

    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    expect(screen.getByText('バリアントA')).toBeInTheDocument()
    expect(screen.getByText('バリアントB')).toBeInTheDocument()
    expect(screen.getByText('バリアントC')).toBeInTheDocument()
  })

  it('selects the correct variant when clicked', () => {
    useReportStore.getState().addVariant('バリアントA')
    useReportStore.getState().addVariant('バリアントB')

    render(<ExportVariantDialog open={true} onSelect={onSelect} onCancel={onCancel} />)
    fireEvent.click(screen.getByText('バリアントB'))

    const arg = onSelect.mock.calls[0][0] as OutputVariant
    expect(arg.name).toBe('バリアントB')
  })
})
