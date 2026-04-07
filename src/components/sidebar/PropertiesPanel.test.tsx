import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { PropertiesPanel } from './PropertiesPanel'
import {
  createTextElement,
  createShapeElement,
  createImageElement,
  createLabelElement,
} from '@/lib/elementFactories'

beforeEach(() => {
  useReportStore.getState().newReport()
})

function addAndSelectElement(createElement: () => ReturnType<typeof createTextElement>) {
  const store = useReportStore.getState()
  const page = store.definition.pages[0]
  const el = createElement()
  store.addElement(page.id, el)
  store.selectElement(el.id, false)
  return el
}

describe('PropertiesPanel — 未選択状態', () => {
  it('shows placeholder text when no element is selected', () => {
    render(<PropertiesPanel />)
    expect(screen.getByText(/要素を選択するとプロパティが表示されます/)).toBeInTheDocument()
  })
})

describe('PropertiesPanel — テキスト要素', () => {
  it('renders position/size section for selected text element', () => {
    addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('位置・サイズ')).toBeInTheDocument()
  })

  it('renders element common section', () => {
    addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('要素')).toBeInTheDocument()
  })

  it('renders duplicate and delete buttons', () => {
    addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('複製')).toBeInTheDocument()
    expect(screen.getByText('削除')).toBeInTheDocument()
  })

  it('shows X position input', () => {
    addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('X (mm)')).toBeInTheDocument()
    expect(screen.getByText('Y (mm)')).toBeInTheDocument()
  })

  it('shows width/height inputs', () => {
    addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('幅 (mm)')).toBeInTheDocument()
    expect(screen.getByText('高さ (mm)')).toBeInTheDocument()
  })
})

describe('PropertiesPanel — 要素名・表示設定', () => {
  it('renders name input in common section', () => {
    addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.getByPlaceholderText('要素名（レイヤー表示用）')).toBeInTheDocument()
  })

  it('renders visible/locked/printable checkboxes', () => {
    addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('表示')).toBeInTheDocument()
    expect(screen.getByText('ロック')).toBeInTheDocument()
    expect(screen.getByText('印刷')).toBeInTheDocument()
  })
})

describe('PropertiesPanel — 複製と削除', () => {
  it('duplicates element when 複製 is clicked', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const page = useReportStore.getState().definition.pages[0]
    const beforeCount = page.sections.flatMap((s) => s.elements).length

    fireEvent.click(screen.getByText('複製'))

    const afterCount = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).length
    expect(afterCount).toBe(beforeCount + 1)
  })

  it('removes element when 削除 is clicked', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const page = useReportStore.getState().definition.pages[0]
    const beforeCount = page.sections.flatMap((s) => s.elements).length

    fireEvent.click(screen.getByText('削除'))

    const afterCount = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).length
    expect(afterCount).toBe(beforeCount - 1)
  })
})

describe('PropertiesPanel — 複数選択', () => {
  it('shows multi-selection message when multiple elements selected', () => {
    const store = useReportStore.getState()
    const page = store.definition.pages[0]
    const el1 = createTextElement()
    const el2 = createTextElement()
    store.addElement(page.id, el1)
    store.addElement(page.id, el2)
    store.selectElement(el1.id, false)
    store.selectElement(el2.id, true) // multi-select

    render(<PropertiesPanel />)
    expect(screen.getByText(/2個の要素を選択中/)).toBeInTheDocument()
  })
})

describe('PropertiesPanel — 形状要素', () => {
  it('renders shape properties section for shape element', () => {
    addAndSelectElement(createShapeElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('位置・サイズ')).toBeInTheDocument()
  })
})

describe('PropertiesPanel — 画像要素', () => {
  it('renders for image element without error', () => {
    addAndSelectElement(createImageElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('位置・サイズ')).toBeInTheDocument()
  })
})

describe('PropertiesPanel — PositionSizeSection interactions', () => {
  it('updates position x when X input changes', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const xInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(xInputs[0], { target: { value: '50' } })

    const updated = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).find((e) => e.id === el.id)
    expect(updated?.position.x).toBe(50)
  })

  it('updates position y when Y input changes', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const yInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(yInputs[1], { target: { value: '25' } })

    const updated = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).find((e) => e.id === el.id)
    expect(updated?.position.y).toBe(25)
  })

  it('updates size width when width input changes', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const widthInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(widthInputs[2], { target: { value: '100' } })

    const updated = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).find((e) => e.id === el.id)
    expect(updated?.size.width).toBe(100)
  })
})

describe('PropertiesPanel — ElementCommonSection interactions', () => {
  it('updates element name when name input changes', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const nameInput = screen.getByPlaceholderText('要素名（レイヤー表示用）')
    fireEvent.change(nameInput, { target: { value: 'カスタム名前' } })

    const updated = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).find((e) => e.id === el.id)
    expect(updated?.name).toBe('カスタム名前')
  })

  it('toggles visible when 表示 checkbox changes', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const visibleCheckbox = screen.getByRole('checkbox', { name: '表示' })
    fireEvent.click(visibleCheckbox)

    const updated = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).find((e) => e.id === el.id)
    expect(updated?.visible).toBe(false)
  })

  it('toggles locked when ロック checkbox changes', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const lockCheckbox = screen.getByRole('checkbox', { name: 'ロック' })
    fireEvent.click(lockCheckbox)

    const updated = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).find((e) => e.id === el.id)
    expect(updated?.locked).toBe(true)
  })

  it('toggles printable when 印刷 checkbox changes', () => {
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    const printCheckbox = screen.getByRole('checkbox', { name: '印刷' })
    fireEvent.click(printCheckbox)

    const updated = useReportStore.getState().definition.pages[0]
      .sections.flatMap((s) => s.elements).find((e) => e.id === el.id)
    expect(updated?.printable).toBe(false)
  })

  it('shows variant checkbox when variants exist', () => {
    // Add a variant first
    useReportStore.getState().addVariant('テストバリアント')
    const el = addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.getByText('バリアント非表示')).toBeInTheDocument()
    expect(screen.getByText('テストバリアント')).toBeInTheDocument()
  })

  it('toggles element hidden in variant when checkbox changes', () => {
    useReportStore.getState().addVariant('バリアントX')
    const el = addAndSelectElement(createTextElement)
    const variantId = useReportStore.getState().definition.outputVariants[0].id

    render(<PropertiesPanel />)
    const variantCheckbox = screen.getByRole('checkbox', { name: 'バリアントX' })
    fireEvent.click(variantCheckbox)

    const updatedVariant = useReportStore.getState().definition.outputVariants[0]
    expect(updatedVariant.hiddenElementIds).toContain(el.id)
  })
})

describe('PropertiesPanel — ViolationsSection', () => {
  it('shows violations when element has validation violations', () => {
    const el = addAndSelectElement(createTextElement)
    useReportStore.getState().setComputedViolations([
      { ruleKey: 'test-rule', message: 'テストエラー', elementId: el.id },
    ])
    render(<PropertiesPanel />)
    expect(screen.getByText('検証エラー')).toBeInTheDocument()
    expect(screen.getByText('テストエラー')).toBeInTheDocument()
  })

  it('does not show violations section when no violations', () => {
    addAndSelectElement(createTextElement)
    render(<PropertiesPanel />)
    expect(screen.queryByText('検証エラー')).not.toBeInTheDocument()
  })
})
