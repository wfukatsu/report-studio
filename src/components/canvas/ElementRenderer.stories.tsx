import type { Meta, StoryObj } from '@storybook/react'
import { ElementRenderer } from './ElementRenderer'
import type { ReportElement } from '@/types'

const meta: Meta<typeof ElementRenderer> = {
  title: 'Canvas/ElementRenderer',
  component: ElementRenderer,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 300, height: 120, border: '1px dashed #ccc', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ElementRenderer>

const base = {
  id: 'el-1',
  zIndex: 1,
  locked: false,
  visible: true,
  position: { x: 13, y: 13 },
}

export const Text: Story = {
  args: {
    element: {
      ...base,
      type: 'text',
      size: { width: 53, height: 10 },
      content: 'Hello, World!',
      style: { fontSize: 16, fontWeight: 'bold', color: '#1f2937', textAlign: 'left' },
    } as ReportElement,
    data: {},
  },
}

export const TextWithBinding: Story = {
  args: {
    element: {
      ...base,
      type: 'text',
      size: { width: 80, height: 10 },
      content: 'Customer: {{customer.name}}',
      style: { fontSize: 14, fontWeight: 'normal', color: '#374151', textAlign: 'left' },
    } as ReportElement,
    data: { customer: { name: 'Acme Corp' } },
  },
}

export const DataField: Story = {
  args: {
    element: {
      ...base,
      type: 'dataField',
      size: { width: 40, height: 8 },
      fieldKey: 'invoice.total',
      label: 'Total Amount',
      style: { fontSize: 13, fontWeight: 'normal', color: '#000000', textAlign: 'right' },
    } as ReportElement,
    data: { invoice: { total: '¥12,000' } },
  },
}

export const DataFieldEmpty: Story = {
  args: {
    element: {
      ...base,
      type: 'dataField',
      size: { width: 40, height: 8 },
      fieldKey: 'invoice.total',
      label: 'Total Amount',
      style: { fontSize: 13, fontWeight: 'normal', color: '#000000', textAlign: 'right' },
    } as ReportElement,
    data: {},
  },
}

export const ShapeRectangle: Story = {
  args: {
    element: {
      ...base,
      type: 'shape',
      size: { width: 60, height: 40 },
      shape: 'rectangle',
      fill: '#dbeafe',
      stroke: '#3b82f6',
      strokeWidth: 2,
    } as ReportElement,
  },
}

export const ShapeCircle: Story = {
  args: {
    element: {
      ...base,
      type: 'shape',
      size: { width: 50, height: 50 },
      shape: 'circle',
      fill: '#fef3c7',
      stroke: '#f59e0b',
      strokeWidth: 1,
    } as ReportElement,
  },
}

export const ShapeLine: Story = {
  args: {
    element: {
      ...base,
      type: 'shape',
      size: { width: 80, height: 4 },
      shape: 'line',
      stroke: '#111827',
      strokeWidth: 2,
    } as ReportElement,
  },
}

export const Image: Story = {
  args: {
    element: {
      ...base,
      type: 'image',
      size: { width: 60, height: 40 },
      src: 'https://picsum.photos/seed/storybook/120/80',
      alt: 'Sample image',
      objectFit: 'cover',
    } as ReportElement,
  },
}

export const Table: Story = {
  args: {
    element: {
      ...base,
      type: 'table',
      size: { width: 100, height: 60 },
      rows: 3,
      columns: 3,
      headerRow: true,
      data: [
        ['Name', 'Amount', 'Date'],
        ['Item A', '¥1,000', '2026-01-01'],
        ['Item B', '¥2,500', '2026-01-02'],
      ],
    } as ReportElement,
  },
}

export const Chart: Story = {
  args: {
    element: {
      ...base,
      type: 'chart',
      size: { width: 80, height: 60 },
      chartType: 'bar',
    } as ReportElement,
  },
}

export const ChartPie: Story = {
  args: {
    element: {
      ...base,
      type: 'chart',
      size: { width: 80, height: 60 },
      chartType: 'pie',
    } as ReportElement,
  },
}

export const Hidden: Story = {
  args: {
    element: {
      ...base,
      type: 'text',
      size: { width: 53, height: 10 },
      visible: false,
      content: 'This should not be visible',
      style: { fontSize: 14, fontWeight: 'normal', color: '#000000', textAlign: 'left' },
    } as ReportElement,
  },
}

// ---------------------------------------------------------------------------
// ManualEntry
// ---------------------------------------------------------------------------

export const ManualEntryLine: Story = {
  name: 'ManualEntry / Line',
  args: {
    element: {
      ...base,
      type: 'manualEntry',
      size: { width: 80, height: 12 },
      label: 'お名前',
      labelPosition: 'top',
      displayMode: 'line',
      lineColor: '#374151',
      style: { fontSize: 3.5 },
    } as ReportElement,
    data: {},
  },
}

export const ManualEntryBox: Story = {
  name: 'ManualEntry / Box',
  args: {
    element: {
      ...base,
      type: 'manualEntry',
      size: { width: 80, height: 15 },
      label: '住所',
      labelPosition: 'left',
      displayMode: 'box',
      lineColor: '#374151',
      style: { fontSize: 3.5 },
    } as ReportElement,
    data: {},
  },
}

export const ManualEntryGrid: Story = {
  name: 'ManualEntry / Grid',
  args: {
    element: {
      ...base,
      type: 'manualEntry',
      size: { width: 80, height: 12 },
      label: '郵便番号',
      labelPosition: 'top',
      displayMode: 'grid',
      gridCount: 7,
      lineColor: '#374151',
      style: { fontSize: 3.5 },
    } as ReportElement,
    data: {},
  },
}

// ---------------------------------------------------------------------------
// Barcode
// ---------------------------------------------------------------------------

export const BarcodeQR: Story = {
  name: 'Barcode / QR',
  args: {
    element: {
      ...base,
      type: 'barcode',
      size: { width: 40, height: 40 },
      kind: 'qr',
      value: 'https://example.com',
    } as ReportElement,
    data: {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 150, height: 150, border: '1px dashed #ccc', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
}

export const BarcodeCODE128: Story = {
  name: 'Barcode / CODE128',
  args: {
    element: {
      ...base,
      type: 'barcode',
      size: { width: 70, height: 20 },
      kind: 'code128',
      value: '12345678',
      showText: true,
    } as ReportElement,
    data: {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 240, height: 80, border: '1px dashed #ccc', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
}

// ---------------------------------------------------------------------------
// Checkbox
// ---------------------------------------------------------------------------

export const CheckboxChecked: Story = {
  name: 'Checkbox / Checked',
  args: {
    element: {
      ...base,
      type: 'checkbox',
      size: { width: 40, height: 8 },
      checked: true,
      checkmark: '✓',
      label: '同意する',
      labelPosition: 'right',
      style: { fontSize: 3.5 },
    } as ReportElement,
    data: {},
  },
}

export const CheckboxUnchecked: Story = {
  name: 'Checkbox / Unchecked',
  args: {
    element: {
      ...base,
      type: 'checkbox',
      size: { width: 40, height: 8 },
      checked: false,
      checkmark: '✓',
      label: '同意する',
      labelPosition: 'right',
      style: { fontSize: 3.5 },
    } as ReportElement,
    data: {},
  },
}

// ---------------------------------------------------------------------------
// RepeatingBand
// ---------------------------------------------------------------------------

export const RepeatingBandWithData: Story = {
  name: 'RepeatingBand / データあり',
  args: {
    element: {
      ...base,
      type: 'repeatingBand',
      size: { width: 120, height: 60 },
      dataSource: 'items',
      itemHeight: 8,
      showHeader: true,
      fields: [
        { key: 'name', label: '品名', width: 60, align: 'left' },
        { key: 'qty', label: '数量', width: 20, align: 'right' },
        { key: 'price', label: '金額', width: 40, align: 'right' },
      ],
    } as ReportElement,
    data: {
      items: [
        { name: 'コーヒー', qty: 2, price: '¥600' },
        { name: 'ケーキ', qty: 1, price: '¥450' },
        { name: 'サンドイッチ', qty: 3, price: '¥1,200' },
      ],
    },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 400, height: 200, border: '1px dashed #ccc', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
}

// ---------------------------------------------------------------------------
// FormTable
// ---------------------------------------------------------------------------

export const FormTableSimple: Story = {
  name: 'FormTable / シンプル',
  args: {
    element: {
      ...base,
      type: 'formTable',
      size: { width: 100, height: 40 },
      borderColor: '#374151',
      borderWidth: 0.3,
      columns: [
        { id: 'col-1', width: 30 },
        { id: 'col-2', width: 70 },
      ],
      rows: [
        {
          id: 'row-1',
          role: 'header',
          height: 8,
          cells: [
            { id: 'c1', type: 'label', text: '項目', style: { fontWeight: 'bold', fontSize: 3, textAlign: 'center' } },
            { id: 'c2', type: 'label', text: '内容', style: { fontWeight: 'bold', fontSize: 3, textAlign: 'center' } },
          ],
        },
        {
          id: 'row-2',
          role: 'body',
          height: 8,
          cells: [
            { id: 'c3', type: 'label', text: '氏名', style: { fontSize: 3 } },
            { id: 'c4', type: 'input', text: '', style: { fontSize: 3 } },
          ],
        },
        {
          id: 'row-3',
          role: 'body',
          height: 8,
          cells: [
            { id: 'c5', type: 'label', text: '住所', style: { fontSize: 3 } },
            { id: 'c6', type: 'input', text: '', style: { fontSize: 3 } },
          ],
        },
      ],
    } as ReportElement,
    data: {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 360, height: 160, border: '1px dashed #ccc', position: 'relative' }}>
        <Story />
      </div>
    ),
  ],
}
