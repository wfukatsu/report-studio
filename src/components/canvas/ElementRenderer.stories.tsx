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
