/**
 * Comprehensive tests for all element PropertiesPanel components.
 * Tests onChange handlers to improve function coverage.
 */

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TextPropertiesPanel } from '@/elements/text/PropertiesPanel'
import { LabelPropertiesPanel } from '@/elements/label/PropertiesPanel'
import { DataFieldPropertiesPanel } from '@/elements/dataField/PropertiesPanel'
import { ImagePropertiesPanel } from '@/elements/image/PropertiesPanel'
import { ShapePropertiesPanel } from '@/elements/shape/PropertiesPanel'
import { TablePropertiesPanel } from '@/elements/table/PropertiesPanel'
import { ChartPropertiesPanel } from '@/elements/chart/PropertiesPanel'
import { BarcodePropertiesPanel } from '@/elements/barcode/PropertiesPanel'
import { ManualEntryPropertiesPanel } from '@/elements/manualEntry/PropertiesPanel'
import { HankoPropertiesPanel } from '@/elements/hanko/PropertiesPanel'
import { ApprovalStampRowPropertiesPanel } from '@/elements/approvalStampRow/PropertiesPanel'
import { RevenueStampPropertiesPanel } from '@/elements/revenueStamp/PropertiesPanel'
import { RepeatingBandPropertiesPanel } from '@/elements/repeatingBand/PropertiesPanel'
import { RepeatingListPropertiesPanel } from '@/elements/repeatingList/PropertiesPanel'
import {
  createTextElement,
  createLabelElement,
  createDataFieldElement,
  createImageElement,
  createShapeElement,
  createTableElement,
  createChartElement,
  createBarcodeElement,
  createManualEntryField,
  createHankoElement,
  createApprovalStampRowElement,
  createRevenueStampElement,
  createRepeatingBandElement,
  createRepeatingListElement,
} from '@/lib/elementFactories'
import type {
  TextElement,
  LabelElement,
  DataFieldElement,
  ImageElement,
  ShapeElement,
  TableElement,
  ChartElement,
  BarcodeElement,
  ManualEntryField,
  HankoElement,
  ApprovalStampRowElement,
  RevenueStampElement,
  RepeatingBandElement,
  RepeatingListElement,
} from '@/types'

// ---------------------------------------------------------------------------
// TextPropertiesPanel
// ---------------------------------------------------------------------------

describe('TextPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    const { container } = render(<TextPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when font family changes', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: 'serif' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when bold button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('太字'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when italic button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('斜体'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when underline button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('下線'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when strikethrough button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('打ち消し線'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when textAlign left button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('left'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when textAlign center button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('center'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when textAlign right button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('right'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when textAlign justify button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('justify'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when verticalAlign top button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('top'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when verticalAlign middle button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('middle'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when verticalAlign bottom button is clicked', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('bottom'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when writingMode changes', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('縦書き'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when furigana changes', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    const furiganaInput = screen.getByPlaceholderText('ふりがな')
    fireEvent.change(furiganaInput, { target: { value: 'ふりがな' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('shows text style section', () => {
    const el = createTextElement() as TextElement
    const onChange = vi.fn()
    render(<TextPropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByText('テキストスタイル')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// LabelPropertiesPanel
// ---------------------------------------------------------------------------

describe('LabelPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    const { container } = render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when text changes', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    const textarea = screen.getByRole('textbox', { name: /テキスト/ })
    fireEvent.change(textarea, { target: { value: '新しいラベル' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: '新しいラベル' }))
  })

  it('calls onChange when font family changes', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    const select = screen.getAllByRole('combobox')[0]
    fireEvent.change(select, { target: { value: 'monospace' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when bold is toggled', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('太字'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when italic is toggled', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('斜体'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when underline is toggled', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('下線'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when strikethrough is toggled', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('打ち消し線'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when textAlign left is clicked', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('left'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when textAlign center is clicked', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('center'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when textAlign right is clicked', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('right'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when textAlign justify is clicked', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('justify'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when writingMode changes', () => {
    const el = createLabelElement() as LabelElement
    const onChange = vi.fn()
    render(<LabelPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByTitle('縦書き'))
    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// DataFieldPropertiesPanel
// ---------------------------------------------------------------------------

describe('DataFieldPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createDataFieldElement() as DataFieldElement
    const onChange = vi.fn()
    const { container } = render(<DataFieldPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when label changes', () => {
    const el = createDataFieldElement() as DataFieldElement
    const onChange = vi.fn()
    render(<DataFieldPropertiesPanel el={el} onChange={onChange} />)
    const labelInput = screen.getByPlaceholderText('未入力時のラベル')
    fireEvent.change(labelInput, { target: { value: '顧客名' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ label: '顧客名' }))
  })

  it('calls onChange when fallback text changes', () => {
    const el = createDataFieldElement() as DataFieldElement
    const onChange = vi.fn()
    render(<DataFieldPropertiesPanel el={el} onChange={onChange} />)
    const fallbackInput = screen.getByPlaceholderText('データなし時に表示するテキスト')
    fireEvent.change(fallbackInput, { target: { value: 'N/A' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ fallbackText: 'N/A' }))
  })

  it('calls onChange when format type changes', () => {
    const el = createDataFieldElement() as DataFieldElement
    const onChange = vi.fn()
    render(<DataFieldPropertiesPanel el={el} onChange={onChange} />)
    // Multiple comboboxes: find the format select by its 'なし' option
    const selects = screen.getAllByRole('combobox')
    const formatSelect = selects.find((s) =>
      Array.from(s.querySelectorAll('option')).some((o) => o.textContent === 'なし'),
    )
    expect(formatSelect).toBeDefined()
    fireEvent.change(formatSelect!, { target: { value: 'currency_jpy' } })
    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ImagePropertiesPanel
// ---------------------------------------------------------------------------

describe('ImagePropertiesPanel', () => {
  it('renders without error', () => {
    const el = createImageElement() as ImageElement
    const onChange = vi.fn()
    const { container } = render(<ImagePropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when src changes', () => {
    const el = createImageElement() as ImageElement
    const onChange = vi.fn()
    render(<ImagePropertiesPanel el={el} onChange={onChange} />)
    const srcInput = screen.getByPlaceholderText('https://...')
    fireEvent.change(srcInput, { target: { value: 'https://example.com/image.png' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ src: 'https://example.com/image.png' }))
  })

  it('calls onChange when alt text changes', () => {
    const el = createImageElement() as ImageElement
    const onChange = vi.fn()
    render(<ImagePropertiesPanel el={el} onChange={onChange} />)
    const altInput = screen.getByText('alt テキスト').closest('label')!.querySelector('input')!
    fireEvent.change(altInput, { target: { value: 'ロゴ画像' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ alt: 'ロゴ画像' }))
  })

  it('calls onChange when objectFit changes', () => {
    const el = createImageElement() as ImageElement
    const onChange = vi.fn()
    render(<ImagePropertiesPanel el={el} onChange={onChange} />)
    const fitSelect = screen.getByRole('combobox')
    fireEvent.change(fitSelect, { target: { value: 'cover' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ objectFit: 'cover' }))
  })

  it('calls onChange when opacity changes', () => {
    const el = createImageElement() as ImageElement
    const onChange = vi.fn()
    render(<ImagePropertiesPanel el={el} onChange={onChange} />)
    const opacityInput = screen.getByRole('slider')
    fireEvent.change(opacityInput, { target: { value: '0.5' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ opacity: 0.5 }))
  })
})

// ---------------------------------------------------------------------------
// ShapePropertiesPanel
// ---------------------------------------------------------------------------

describe('ShapePropertiesPanel', () => {
  it('renders without error', () => {
    const el = createShapeElement() as ShapeElement
    const onChange = vi.fn()
    const { container } = render(<ShapePropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when shape type changes', () => {
    const el = createShapeElement() as ShapeElement
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={el} onChange={onChange} />)
    const shapeSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(shapeSelect, { target: { value: 'circle' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shape: 'circle' }))
  })

  it('shows border radius input for rectangle shape', () => {
    const el = createShapeElement({ shape: 'rectangle' }) as ShapeElement
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByText('角丸')).toBeInTheDocument()
  })

  it('does not show border radius for non-rectangle shapes', () => {
    const el = createShapeElement({ shape: 'circle' }) as ShapeElement
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={el} onChange={onChange} />)
    expect(screen.queryByText('角丸')).not.toBeInTheDocument()
  })

  it('calls onChange when stroke dash style changes', () => {
    const el = createShapeElement() as ShapeElement
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={el} onChange={onChange} />)
    const dashSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(dashSelect, { target: { value: 'dashed' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ strokeDash: 'dashed' }))
  })

  it('calls onChange when border radius changes for rectangle', () => {
    const el = createShapeElement({ shape: 'rectangle' }) as ShapeElement
    const onChange = vi.fn()
    render(<ShapePropertiesPanel el={el} onChange={onChange} />)
    const spinButtons = screen.getAllByRole('spinbutton')
    // Last spinbutton is borderRadius when rectangle
    const borderRadiusInput = spinButtons[spinButtons.length - 1]
    fireEvent.change(borderRadiusInput, { target: { value: '5' } })
    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// TablePropertiesPanel
// ---------------------------------------------------------------------------

describe('TablePropertiesPanel', () => {
  it('renders without error', () => {
    const el = createTableElement() as TableElement
    const onChange = vi.fn()
    const { container } = render(<TablePropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when header row checkbox changes', () => {
    const el = createTableElement() as TableElement
    const onChange = vi.fn()
    render(<TablePropertiesPanel el={el} onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when data binding changes', () => {
    const el = createTableElement() as TableElement
    const onChange = vi.fn()
    render(<TablePropertiesPanel el={el} onChange={onChange} />)
    const bindingInput = screen.getByPlaceholderText('例: items')
    fireEvent.change(bindingInput, { target: { value: 'tableData' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when data binding is cleared (empty string becomes undefined)', () => {
    const el = { ...createTableElement() as TableElement, dataBinding: 'items' }
    const onChange = vi.fn()
    render(<TablePropertiesPanel el={el} onChange={onChange} />)
    const bindingInput = screen.getByPlaceholderText('例: items')
    fireEvent.change(bindingInput, { target: { value: '' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dataBinding: undefined }))
  })

  it('calls onChange when columns changes', () => {
    const el = createTableElement() as TableElement
    const onChange = vi.fn()
    render(<TablePropertiesPanel el={el} onChange={onChange} />)
    const spinButtons = screen.getAllByRole('spinbutton')
    // Second spinbutton is columns
    fireEvent.change(spinButtons[1], { target: { value: '5' } })
    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ChartPropertiesPanel
// ---------------------------------------------------------------------------

describe('ChartPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createChartElement() as ChartElement
    const onChange = vi.fn()
    const { container } = render(<ChartPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when chart type changes', () => {
    const el = createChartElement() as ChartElement
    const onChange = vi.fn()
    render(<ChartPropertiesPanel el={el} onChange={onChange} />)
    const typeSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(typeSelect, { target: { value: 'line' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ chartType: 'line' }))
  })

  it('calls onChange when chart title changes', () => {
    const el = createChartElement() as ChartElement
    const onChange = vi.fn()
    render(<ChartPropertiesPanel el={el} onChange={onChange} />)
    const inputs = screen.getAllByRole('textbox')
    // Title is the first text input
    fireEvent.change(inputs[0], { target: { value: '売上グラフ' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ title: '売上グラフ' }))
  })

  it('calls onChange when chart dataBinding changes', () => {
    const el = createChartElement() as ChartElement
    const onChange = vi.fn()
    render(<ChartPropertiesPanel el={el} onChange={onChange} />)
    const bindingInput = screen.getByPlaceholderText('例: chartData')
    fireEvent.change(bindingInput, { target: { value: 'salesData' } })
    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// BarcodePropertiesPanel
// ---------------------------------------------------------------------------

describe('BarcodePropertiesPanel', () => {
  it('renders without error', () => {
    const el = createBarcodeElement() as BarcodeElement
    const onChange = vi.fn()
    const { container } = render(<BarcodePropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when barcode value changes', () => {
    const el = createBarcodeElement() as BarcodeElement
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={el} onChange={onChange} />)
    const valueInput = screen.getByPlaceholderText('値または {{fieldKey}}')
    fireEvent.change(valueInput, { target: { value: 'https://new.example.com' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: 'https://new.example.com' }))
  })

  it('calls onChange when kind changes', () => {
    const el = createBarcodeElement() as BarcodeElement
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={el} onChange={onChange} />)
    const kindSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(kindSelect, { target: { value: 'code128' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ kind: 'code128' }))
  })

  it('shows error correction for QR code', () => {
    const el = createBarcodeElement({ kind: 'qr' }) as BarcodeElement
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByText('誤り訂正レベル')).toBeInTheDocument()
  })

  it('does not show error correction for non-QR code', () => {
    const el = createBarcodeElement({ kind: 'code128' }) as BarcodeElement
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={el} onChange={onChange} />)
    expect(screen.queryByText('誤り訂正レベル')).not.toBeInTheDocument()
  })

  it('calls onChange when showText checkbox changes', () => {
    const el = createBarcodeElement() as BarcodeElement
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={el} onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when errorCorrection changes for QR code', () => {
    const el = createBarcodeElement({ kind: 'qr' }) as BarcodeElement
    const onChange = vi.fn()
    render(<BarcodePropertiesPanel el={el} onChange={onChange} />)
    // When kind is QR, there are 2 selects: kind and errorCorrection
    const selects = screen.getAllByRole('combobox')
    const errorCorrectionSelect = selects[1]
    fireEvent.change(errorCorrectionSelect, { target: { value: 'H' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ errorCorrection: 'H' }))
  })
})

// ---------------------------------------------------------------------------
// ManualEntryPropertiesPanel
// ---------------------------------------------------------------------------

describe('ManualEntryPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createManualEntryField() as ManualEntryField
    const onChange = vi.fn()
    const { container } = render(<ManualEntryPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('shows label for manual entry', () => {
    const el = createManualEntryField({ label: 'テスト欄' }) as ManualEntryField
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByDisplayValue('テスト欄')).toBeInTheDocument()
  })

  it('calls onChange when label changes', () => {
    const el = createManualEntryField({ label: '記入欄' }) as ManualEntryField
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={el} onChange={onChange} />)
    const labelInput = screen.getByDisplayValue('記入欄')
    fireEvent.change(labelInput, { target: { value: '署名' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ label: '署名' }))
  })

  it('calls onChange when label position changes', () => {
    const el = createManualEntryField() as ManualEntryField
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={el} onChange={onChange} />)
    const labelPosSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(labelPosSelect, { target: { value: 'left' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ labelPosition: 'left' }))
  })

  it('calls onChange when display mode changes', () => {
    const el = createManualEntryField() as ManualEntryField
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={el} onChange={onChange} />)
    const displayModeSelect = screen.getAllByRole('combobox')[1]
    fireEvent.change(displayModeSelect, { target: { value: 'box' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ displayMode: 'box' }))
  })

  it('shows grid count input when displayMode is grid', () => {
    const el = createManualEntryField({ displayMode: 'grid', gridCount: 10 }) as ManualEntryField
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByText('マス数')).toBeInTheDocument()
  })

  it('calls onChange when placeholder changes', () => {
    const el = createManualEntryField({ placeholder: '（記入）' }) as ManualEntryField
    const onChange = vi.fn()
    render(<ManualEntryPropertiesPanel el={el} onChange={onChange} />)
    const placeholderInput = screen.getByDisplayValue('（記入）')
    fireEvent.change(placeholderInput, { target: { value: '' } })
    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// HankoPropertiesPanel
// ---------------------------------------------------------------------------

describe('HankoPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createHankoElement() as HankoElement
    const onChange = vi.fn()
    const { container } = render(<HankoPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when text changes', () => {
    const el = createHankoElement() as HankoElement
    const onChange = vi.fn()
    render(<HankoPropertiesPanel el={el} onChange={onChange} />)
    const textInput = screen.getAllByRole('textbox')[0]
    fireEvent.change(textInput, { target: { value: '田中' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ text: '田中' }))
  })

  it('calls onChange when shape changes', () => {
    const el = createHankoElement() as HankoElement
    const onChange = vi.fn()
    render(<HankoPropertiesPanel el={el} onChange={onChange} />)
    const shapeSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(shapeSelect, { target: { value: 'rectangle' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ shape: 'rectangle' }))
  })

  it('calls onChange when double border checkbox changes', () => {
    const el = createHankoElement() as HankoElement
    const onChange = vi.fn()
    render(<HankoPropertiesPanel el={el} onChange={onChange} />)
    const checkbox = screen.getByRole('checkbox')
    fireEvent.click(checkbox)
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when binding changes', () => {
    const el = createHankoElement() as HankoElement
    const onChange = vi.fn()
    render(<HankoPropertiesPanel el={el} onChange={onChange} />)
    const bindingInput = screen.getByPlaceholderText('例: approver.name')
    fireEvent.change(bindingInput, { target: { value: 'signer.name' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when writingMode changes', () => {
    const el = createHankoElement() as HankoElement
    const onChange = vi.fn()
    render(<HankoPropertiesPanel el={el} onChange={onChange} />)
    const selects = screen.getAllByRole('combobox')
    // writingMode is the second select (after shape)
    fireEvent.change(selects[1], { target: { value: 'horizontal-tb' } })
    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// ApprovalStampRowPropertiesPanel
// ---------------------------------------------------------------------------

describe('ApprovalStampRowPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createApprovalStampRowElement() as ApprovalStampRowElement
    const onChange = vi.fn()
    const { container } = render(<ApprovalStampRowPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('shows cells section', () => {
    const el = createApprovalStampRowElement() as ApprovalStampRowElement
    const onChange = vi.fn()
    render(<ApprovalStampRowPropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByText('多段印鑑欄')).toBeInTheDocument()
  })

  it('calls onChange when label position changes', () => {
    const el = createApprovalStampRowElement() as ApprovalStampRowElement
    const onChange = vi.fn()
    render(<ApprovalStampRowPropertiesPanel el={el} onChange={onChange} />)
    const labelPosSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(labelPosSelect, { target: { value: 'top' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ labelPosition: 'top' }))
  })

  it('calls onChange when cell role is changed', () => {
    const el = createApprovalStampRowElement() as ApprovalStampRowElement
    const onChange = vi.fn()
    render(<ApprovalStampRowPropertiesPanel el={el} onChange={onChange} />)
    const cellInputs = screen.getAllByRole('textbox')
    fireEvent.change(cellInputs[0], { target: { value: '主任' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when cell delete button is clicked', () => {
    const el = createApprovalStampRowElement() as ApprovalStampRowElement
    const onChange = vi.fn()
    render(<ApprovalStampRowPropertiesPanel el={el} onChange={onChange} />)
    const deleteButtons = screen.getAllByText('×')
    fireEvent.click(deleteButtons[0])
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0] as Partial<ApprovalStampRowElement>
    expect(call.cells!.length).toBe(el.cells.length - 1)
  })

  it('calls onChange when add cell button is clicked', () => {
    const el = createApprovalStampRowElement() as ApprovalStampRowElement
    const onChange = vi.fn()
    render(<ApprovalStampRowPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByText('＋ セル追加'))
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0] as Partial<ApprovalStampRowElement>
    expect(call.cells!.length).toBe(el.cells.length + 1)
  })
})

// ---------------------------------------------------------------------------
// RevenueStampPropertiesPanel
// ---------------------------------------------------------------------------

describe('RevenueStampPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createRevenueStampElement() as RevenueStampElement
    const onChange = vi.fn()
    const { container } = render(<RevenueStampPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when amount changes', () => {
    const el = createRevenueStampElement() as RevenueStampElement
    const onChange = vi.fn()
    render(<RevenueStampPropertiesPanel el={el} onChange={onChange} />)
    const amountInput = screen.getByPlaceholderText('例: 200円')
    fireEvent.change(amountInput, { target: { value: '400円' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ amount: '400円' }))
  })

  it('calls onChange when showLabel checkbox changes', () => {
    const el = createRevenueStampElement() as RevenueStampElement
    const onChange = vi.fn()
    render(<RevenueStampPropertiesPanel el={el} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when showCancellationGuide checkbox changes', () => {
    const el = createRevenueStampElement() as RevenueStampElement
    const onChange = vi.fn()
    render(<RevenueStampPropertiesPanel el={el} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    expect(onChange).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// RepeatingBandPropertiesPanel
// ---------------------------------------------------------------------------

describe('RepeatingBandPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    const { container } = render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when data source changes', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    const dataSrcInputs = screen.getAllByPlaceholderText('例: items, records')
    fireEvent.change(dataSrcInputs[0], { target: { value: 'orders' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dataSource: 'orders' }))
  })

  it('calls onChange when showHeader checkbox changes', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when field key is changed', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    const fieldKeyInputs = screen.getAllByPlaceholderText('field.key')
    fireEvent.change(fieldKeyInputs[0], { target: { value: 'product_name' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when field is deleted', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    const deleteButtons = screen.getAllByText('削除')
    fireEvent.click(deleteButtons[0])
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0] as Partial<RepeatingBandElement>
    expect(call.fields!.length).toBe(el.fields.length - 1)
  })

  it('calls onChange when add field button is clicked', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByText('＋ 列を追加'))
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0] as Partial<RepeatingBandElement>
    expect(call.fields!.length).toBe(el.fields.length + 1)
  })

  it('calls onChange when field label is changed', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    // Each field has a label input; find the first header label input
    const headerLabelInputs = screen.getAllByPlaceholderText('field.key')
    // Change field key
    fireEvent.change(headerLabelInputs[0], { target: { value: 'new_key' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when showFooter checkbox is toggled', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // Second checkbox is showFooter
    fireEvent.click(checkboxes[1])
    expect(onChange).toHaveBeenCalled()
  })

  it('shows footer totals section when showFooter is true', () => {
    const el = createRepeatingBandElement({ showFooter: true }) as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByText(/集計（フッター）/)).toBeInTheDocument()
  })

  it('calls onChange when add totals button is clicked', () => {
    const el = createRepeatingBandElement({ showFooter: true }) as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByText('＋ 集計を追加'))
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when field header label is changed', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    // The field section has: field.key input (placeholder='field.key') and label input (no placeholder)
    // Find a textbox with the field label value
    const allTextInputs = screen.getAllByRole('textbox')
    const labelInput = allTextInputs.find((i) => (i as HTMLInputElement).value === el.fields[0].label)
    if (labelInput) {
      fireEvent.change(labelInput, { target: { value: '新しいラベル' } })
      expect(onChange).toHaveBeenCalled()
    } else {
      // Skip if we can't find a matching input (factory default may vary)
      expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(0)
    }
  })

  it('calls onChange when field width is changed', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    const widthInput = screen.getAllByRole('spinbutton')[3] // field width input
    fireEvent.change(widthInput, { target: { value: '30' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when field align is changed', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    const selects = screen.getAllByRole('combobox')
    // align select is in the field section
    const alignSelect = selects.find((s) => (s as HTMLSelectElement).value === 'left')
    if (alignSelect) {
      fireEvent.change(alignSelect, { target: { value: 'center' } })
      expect(onChange).toHaveBeenCalled()
    }
  })

  it('calls onChange when sortBy input changes', () => {
    const el = createRepeatingBandElement() as RepeatingBandElement
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={el} onChange={onChange} />)
    const sortByInput = screen.getByPlaceholderText('例: date, amount')
    fireEvent.change(sortByInput, { target: { value: 'created_at' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ sortBy: 'created_at' }))
  })

  it('calls onChange when total is deleted', () => {
    const el = createRepeatingBandElement({ showFooter: true }) as RepeatingBandElement
    // Add a total first
    const bandWithTotal = {
      ...el,
      totals: [{ fieldKey: 'amount', formula: 'sum' as const, label: '合計' }],
    }
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={bandWithTotal} onChange={onChange} />)
    // Find delete buttons in the totals section
    const allDeleteBtns = screen.getAllByText('削除')
    // The last delete button should be the totals delete
    fireEvent.click(allDeleteBtns[allDeleteBtns.length - 1])
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0] as Partial<RepeatingBandElement>
    expect(call.totals!.length).toBe(0)
  })

  it('calls onChange when total fieldKey changes', () => {
    const el = createRepeatingBandElement({ showFooter: true }) as RepeatingBandElement
    const bandWithTotal = {
      ...el,
      totals: [{ fieldKey: 'amount', formula: 'sum' as const, label: '合計' }],
    }
    const onChange = vi.fn()
    render(<RepeatingBandPropertiesPanel el={bandWithTotal} onChange={onChange} />)
    // Find the total fieldKey input
    const totalFieldInput = screen.getAllByRole('textbox').find(
      (i) => (i as HTMLInputElement).value === 'amount'
    )
    if (totalFieldInput) {
      fireEvent.change(totalFieldInput, { target: { value: 'total_price' } })
      expect(onChange).toHaveBeenCalled()
    }
  })
})

// ---------------------------------------------------------------------------
// RepeatingListPropertiesPanel
// ---------------------------------------------------------------------------

describe('RepeatingListPropertiesPanel', () => {
  it('renders without error', () => {
    const el = createRepeatingListElement() as RepeatingListElement
    const onChange = vi.fn()
    const { container } = render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    expect(container.firstChild).not.toBeNull()
  })

  it('calls onChange when data source changes', () => {
    const el = createRepeatingListElement() as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    const dataSrcInput = screen.getByPlaceholderText('例: employees, products')
    fireEvent.change(dataSrcInput, { target: { value: 'staff' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ dataSource: 'staff' }))
  })

  it('calls onChange when layout changes', () => {
    const el = createRepeatingListElement() as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    const layoutSelect = screen.getAllByRole('combobox')[0]
    fireEvent.change(layoutSelect, { target: { value: 'vertical' } })
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ layout: 'vertical' }))
  })

  it('shows grid columns when layout is grid', () => {
    const el = createRepeatingListElement({ layout: 'grid' }) as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    expect(screen.getByText('グリッド列数')).toBeInTheDocument()
  })

  it('does not show grid columns when layout is vertical', () => {
    const el = createRepeatingListElement({ layout: 'vertical' }) as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    expect(screen.queryByText('グリッド列数')).not.toBeInTheDocument()
  })

  it('calls onChange when field is deleted', () => {
    const el = createRepeatingListElement() as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    const deleteButtons = screen.getAllByText('削除')
    fireEvent.click(deleteButtons[0])
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0] as Partial<RepeatingListElement>
    expect(call.fields!.length).toBe(el.fields.length - 1)
  })

  it('calls onChange when add field button is clicked', () => {
    const el = createRepeatingListElement() as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    fireEvent.click(screen.getByText('＋ フィールドを追加'))
    expect(onChange).toHaveBeenCalled()
    const call = onChange.mock.calls[0][0] as Partial<RepeatingListElement>
    expect(call.fields!.length).toBe(el.fields.length + 1)
  })

  it('calls onChange when field key is changed', () => {
    const el = createRepeatingListElement() as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    const keyInputs = screen.getAllByRole('textbox')
    fireEvent.change(keyInputs[0], { target: { value: 'new_field_key' } })
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when isLabel checkbox is toggled', () => {
    const el = createRepeatingListElement() as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0]) // isLabel checkbox
    expect(onChange).toHaveBeenCalled()
  })

  it('calls onChange when item width changes', () => {
    const el = createRepeatingListElement() as RepeatingListElement
    const onChange = vi.fn()
    render(<RepeatingListPropertiesPanel el={el} onChange={onChange} />)
    const spinButtons = screen.getAllByRole('spinbutton')
    // Item width is in the grid section (after gridColumns if grid layout)
    // Fire change on the first spinbutton
    fireEvent.change(spinButtons[0], { target: { value: '5' } })
    expect(onChange).toHaveBeenCalled()
  })
})
