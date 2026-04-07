import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { useReportStore } from '@/store'
import { CalculationTab } from './CalculationTab'

vi.mock('@/lib/jexlEngine', () => ({
  evaluateExpression: vi.fn(),
}))

import { evaluateExpression } from '@/lib/jexlEngine'
const mockEvaluate = vi.mocked(evaluateExpression)

beforeEach(() => {
  useReportStore.getState().newReport()
  vi.clearAllMocks()
})

describe('CalculationTab — 初期状態', () => {
  it('renders empty state message when no rules', () => {
    render(<CalculationTab />)
    expect(screen.getByText('計算ルールがありません')).toBeInTheDocument()
  })

  it('renders add button', () => {
    render(<CalculationTab />)
    expect(screen.getByText('+ 追加')).toBeInTheDocument()
  })

  it('renders section heading', () => {
    render(<CalculationTab />)
    expect(screen.getByText('計算ルール')).toBeInTheDocument()
  })
})

describe('CalculationTab — ルール追加', () => {
  it('adds a rule when + 追加 is clicked', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    const rules = useReportStore.getState().definition.calculationRules
    expect(rules).toHaveLength(1)
  })

  it('renders rule row with inputs after adding', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(screen.getByPlaceholderText('calc_total')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('合計金額')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('price * quantity')).toBeInTheDocument()
  })

  it('renders result type and onError selects', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(screen.getByText('数値')).toBeInTheDocument()
    expect(screen.getByText('0 を返す')).toBeInTheDocument()
  })
})

describe('CalculationTab — ルール編集', () => {
  it('updates key when key input changes', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const keyInput = screen.getByPlaceholderText('calc_total')
    fireEvent.change(keyInput, { target: { value: 'my_calc' } })

    const rules = useReportStore.getState().definition.calculationRules
    expect(rules[0].key).toBe('my_calc')
  })

  it('updates expression when expression input changes', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const exprInput = screen.getByPlaceholderText('price * quantity')
    fireEvent.change(exprInput, { target: { value: 'a + b' } })

    const rules = useReportStore.getState().definition.calculationRules
    expect(rules[0].expression).toBe('a + b')
  })

  it('updates resultType when select changes', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const typeSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(typeSelect, { target: { value: 'string' } })

    const rules = useReportStore.getState().definition.calculationRules
    expect(rules[0].resultType).toBe('string')
  })

  it('updates onError when select changes', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const onErrorSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(onErrorSelect, { target: { value: 'empty' } })

    const rules = useReportStore.getState().definition.calculationRules
    expect(rules[0].onError).toBe('empty')
  })
})

describe('CalculationTab — テストボタン', () => {
  it('renders テスト button in rule row', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(screen.getByText('テスト')).toBeInTheDocument()
  })

  it('shows test result on successful evaluation', async () => {
    mockEvaluate.mockResolvedValue(42)
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    fireEvent.click(screen.getByText('テスト'))
    await waitFor(() => {
      expect(screen.getByText('結果: 42')).toBeInTheDocument()
    })
  })

  it('shows error result on evaluation failure', async () => {
    mockEvaluate.mockRejectedValue(new Error('構文エラー'))
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    fireEvent.click(screen.getByText('テスト'))
    await waitFor(() => {
      expect(screen.getByText(/エラー: 構文エラー/)).toBeInTheDocument()
    })
  })
})

describe('CalculationTab — ルール削除', () => {
  it('removes rule when 削除 is clicked', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(useReportStore.getState().definition.calculationRules).toHaveLength(1)

    fireEvent.click(screen.getByText('削除'))
    expect(useReportStore.getState().definition.calculationRules).toHaveLength(0)
  })
})
