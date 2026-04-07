import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { ValidationTab } from './ValidationTab'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('ValidationTab — 初期状態', () => {
  it('renders empty state message when no rules', () => {
    render(<ValidationTab />)
    expect(screen.getByText('バリデーションルールがありません')).toBeInTheDocument()
  })

  it('renders add button', () => {
    render(<ValidationTab />)
    expect(screen.getByText('+ 追加')).toBeInTheDocument()
  })

  it('renders section heading', () => {
    render(<ValidationTab />)
    expect(screen.getByText('バリデーションルール')).toBeInTheDocument()
  })
})

describe('ValidationTab — ルール追加', () => {
  it('adds a rule when + 追加 is clicked', () => {
    render(<ValidationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    const rules = useReportStore.getState().definition.validationRules
    expect(rules).toHaveLength(1)
  })

  it('renders rule row after adding', () => {
    render(<ValidationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(screen.getByPlaceholderText('total < 0')).toBeInTheDocument()
    expect(screen.getByPlaceholderText('合計金額が不正です')).toBeInTheDocument()
  })

  it('renders severity options', () => {
    render(<ValidationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(screen.getByText('エラー')).toBeInTheDocument()
    expect(screen.getByText('警告')).toBeInTheDocument()
  })
})

describe('ValidationTab — ルール編集', () => {
  it('updates condition when condition input changes', () => {
    render(<ValidationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const conditionInput = screen.getByPlaceholderText('total < 0')
    fireEvent.change(conditionInput, { target: { value: 'amount < 0' } })

    const rules = useReportStore.getState().definition.validationRules
    expect(rules[0].condition).toBe('amount < 0')
  })

  it('updates message when message input changes', () => {
    render(<ValidationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const messageInput = screen.getByPlaceholderText('合計金額が不正です')
    fireEvent.change(messageInput, { target: { value: 'エラーが発生しました' } })

    const rules = useReportStore.getState().definition.validationRules
    expect(rules[0].message).toBe('エラーが発生しました')
  })

  it('updates severity when select changes', () => {
    render(<ValidationTab />)
    fireEvent.click(screen.getByText('+ 追加'))

    const severitySelect = screen.getByRole('combobox')
    fireEvent.change(severitySelect, { target: { value: 'warning' } })

    const rules = useReportStore.getState().definition.validationRules
    expect(rules[0].severity).toBe('warning')
  })
})

describe('ValidationTab — ルール削除', () => {
  it('removes rule when 削除 is clicked', () => {
    render(<ValidationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    expect(useReportStore.getState().definition.validationRules).toHaveLength(1)

    fireEvent.click(screen.getByText('削除'))
    expect(useReportStore.getState().definition.validationRules).toHaveLength(0)
  })
})

describe('ValidationTab — 複数ルール', () => {
  it('renders multiple rules', () => {
    render(<ValidationTab />)
    fireEvent.click(screen.getByText('+ 追加'))
    fireEvent.click(screen.getByText('+ 追加'))

    const conditionInputs = screen.getAllByPlaceholderText('total < 0')
    expect(conditionInputs).toHaveLength(2)
  })
})
