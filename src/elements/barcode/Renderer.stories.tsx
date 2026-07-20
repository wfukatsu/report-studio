import type { Meta, StoryObj } from '@storybook/react-vite'
import { BarcodeRenderer } from './Renderer'
import type { BarcodeElement } from '@/types'

function makeEl(overrides?: Partial<BarcodeElement>): BarcodeElement {
  return {
    id: 'story-barcode-1',
    type: 'barcode',
    position: { x: 0, y: 0 },
    size: { width: 30, height: 30 },
    zIndex: 1,
    visible: true,
    locked: false,
    kind: 'qr',
    value: 'https://example.com',
    errorCorrection: 'M',
    darkColor: '#000000',
    lightColor: '#ffffff',
    showText: false,
    ...overrides,
  } as BarcodeElement
}

const meta: Meta<typeof BarcodeRenderer> = {
  title: 'Elements/Barcode/Renderer',
  component: BarcodeRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 160, height: 160, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof BarcodeRenderer>

export const Qr: Story = {
  name: 'QRコード',
  args: {
    element: makeEl(),
    data: {},
  },
}

export const Code128: Story = {
  name: 'CODE128（テキスト表示）',
  args: {
    element: makeEl({ kind: 'code128', value: 'INV-2026-0001', showText: true, size: { width: 60, height: 15 } }),
    data: {},
  },
  decorators: [
    (Story) => (
      <div style={{ width: 240, height: 80, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
}

/** Value contains a {{token}} resolved from data */
export const WithBinding: Story = {
  name: 'データバインド（{{token}}）',
  args: {
    element: makeEl({ value: 'INV-{{invoice.no}}', kind: 'qr' }),
    data: { invoice: { no: '2026-0042' } },
  },
}
