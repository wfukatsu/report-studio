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

describe('CalculationTab — 説明フィールド', () => {
  it('renders description input', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(screen.getByTestId('description-input')).toBeInTheDocument()
  })

  it('updates description when changed', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const descInput = screen.getByTestId('description-input')
    fireEvent.change(descInput, { target: { value: '合計金額の計算' } })

    const rules = useReportStore.getState().definition.calculationRules
    expect(rules[0].description).toBe('合計金額の計算')
  })

  it('sets description to undefined when cleared', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const descInput = screen.getByTestId('description-input')
    fireEvent.change(descInput, { target: { value: 'memo' } })
    fireEvent.change(descInput, { target: { value: '' } })

    const rules = useReportStore.getState().definition.calculationRules
    expect(rules[0].description).toBeUndefined()
  })
})

describe('CalculationTab — 式テキストエリア', () => {
  it('renders expression as textarea', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    const ta = screen.getByPlaceholderText('price * quantity')
    expect(ta.tagName).toBe('TEXTAREA')
  })
})

describe('CalculationTab — キー重複バリデーション', () => {
  it('shows duplicate warning when two rules share the same key', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    fireEvent.click(screen.getByText('+ 追加'))

    const keyInputs = screen.getAllByPlaceholderText('calc_total')
    // Set both keys to the same value
    fireEvent.change(keyInputs[0], { target: { value: 'same_key' } })
    fireEvent.change(keyInputs[1], { target: { value: 'same_key' } })

    expect(screen.getAllByText('キーが重複しています')).toHaveLength(2)
  })

  it('does not show duplicate warning for unique keys', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    fireEvent.click(screen.getByText('+ 追加'))

    const keyInputs = screen.getAllByPlaceholderText('calc_total')
    fireEvent.change(keyInputs[0], { target: { value: 'key_a' } })
    fireEvent.change(keyInputs[1], { target: { value: 'key_b' } })

    expect(screen.queryByText('キーが重複しています')).not.toBeInTheDocument()
  })
})

describe('CalculationTab — 書式エディタ', () => {
  it('renders format toggle for number result type', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    // Default is number, so format toggle should be present
    expect(screen.getByTestId('format-toggle')).toBeInTheDocument()
  })

  it('does not render format toggle for boolean result type', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const typeSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(typeSelect, { target: { value: 'boolean' } })

    expect(screen.queryByTestId('format-toggle')).not.toBeInTheDocument()
  })

  it('enables format when toggle is clicked', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    fireEvent.click(screen.getByTestId('format-toggle'))
    expect(screen.getByTestId('format-type-select')).toBeInTheDocument()
  })

  it('updates format type in store when format select changes', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    fireEvent.click(screen.getByTestId('format-toggle'))
    const formatSelect = screen.getByTestId('format-type-select')
    fireEvent.change(formatSelect, { target: { value: 'currency_jpy' } })

    const rules = useReportStore.getState().definition.calculationRules
    expect(rules[0].format?.type).toBe('currency_jpy')
  })

  it('shows decimal places input for decimal format', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    fireEvent.click(screen.getByTestId('format-toggle'))
    const formatSelect = screen.getByTestId('format-type-select')
    fireEvent.change(formatSelect, { target: { value: 'decimal' } })

    expect(screen.getByTestId('format-decimal-places')).toBeInTheDocument()
  })

  it('shows custom pattern input for custom format', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    fireEvent.click(screen.getByTestId('format-toggle'))
    const formatSelect = screen.getByTestId('format-type-select')
    fireEvent.change(formatSelect, { target: { value: 'custom' } })

    expect(screen.getByTestId('format-custom-pattern')).toBeInTheDocument()
  })

  it('disables format when toggle clicked again', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    // Enable
    fireEvent.click(screen.getByTestId('format-toggle'))
    expect(screen.getByTestId('format-type-select')).toBeInTheDocument()

    // Disable
    fireEvent.click(screen.getByTestId('format-toggle'))
    expect(screen.queryByTestId('format-type-select')).not.toBeInTheDocument()

    const rules = useReportStore.getState().definition.calculationRules
    expect(rules[0].format).toBeUndefined()
  })

  it('shows date format options for string result type', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const typeSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(typeSelect, { target: { value: 'string' } })

    fireEvent.click(screen.getByTestId('format-toggle'))
    const formatSelect = screen.getByTestId('format-type-select')
    expect(formatSelect).toBeInTheDocument()
    // Check a date format option is present
    expect(screen.getByText('yyyy/MM/dd')).toBeInTheDocument()
  })
})

describe('CalculationTab — 変数参照パネル', () => {
  it('renders variable panel toggle', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(screen.getByTestId('variable-panel-toggle')).toBeInTheDocument()
  })

  it('shows variable panel when toggle is clicked', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    fireEvent.click(screen.getByTestId('variable-panel-toggle'))
    expect(screen.getByTestId('variable-panel')).toBeInTheDocument()
  })

  it('shows builtin functions in variable panel', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    fireEvent.click(screen.getByTestId('variable-panel-toggle'))
    expect(screen.getByText('sum(arr)')).toBeInTheDocument()
    expect(screen.getByText('count(arr)')).toBeInTheDocument()
    expect(screen.getByText('round(value, places)')).toBeInTheDocument()
  })

  it('shows schema fields when schema is defined', () => {
    useReportStore.getState().addSchemaGroup('master')
    const groupId = useReportStore.getState().definition.schema!.groups[0].id
    useReportStore.getState().addSchemaField(groupId, {
      id: 'f1', key: 'price', label: '単価', type: 'number',
    })

    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    fireEvent.click(screen.getByTestId('variable-panel-toggle'))

    expect(screen.getByText('price')).toBeInTheDocument()
  })

  it('shows other rule keys in variable panel', () => {
    render(<CalculationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    fireEvent.click(screen.getByText('+ 追加'))

    // Set first rule's key
    const keyInputs = screen.getAllByPlaceholderText('calc_total')
    fireEvent.change(keyInputs[0], { target: { value: 'subtotal' } })

    // Open second rule's variable panel
    const toggles = screen.getAllByTestId('variable-panel-toggle')
    fireEvent.click(toggles[1])

    expect(screen.getByText('subtotal')).toBeInTheDocument()
  })
})
