import type { Meta, StoryObj } from '@storybook/react-vite'
import { RepeatingBandRenderer } from './Renderer'
import type { RepeatingBandElement } from '@/types'

function makeEl(overrides?: Partial<RepeatingBandElement>): RepeatingBandElement {
  return {
    id: 'story-band-1',
    type: 'repeatingBand',
    position: { x: 0, y: 0 },
    size: { width: 175, height: 60 },
    zIndex: 1,
    visible: true,
    locked: false,
    dataSource: 'items',
    itemHeight: 8,
    fields: [
      { key: 'no', label: 'No.', width: 12, align: 'center' },
      { key: 'name', label: '品目', width: 55, align: 'left' },
      { key: 'quantity', label: '数量', width: 18, align: 'right' },
      { key: 'unitPrice', label: '単価', width: 22, align: 'right', format: { type: 'comma' } },
      { key: 'amount', label: '金額', width: 25, align: 'right', format: { type: 'comma' } },
    ],
    showHeader: true,
    showFooter: false,
    totals: [],
    pageBreak: 'none',
    maxItems: 0,
    oddRowColor: '#ffffff',
    evenRowColor: '#f9fafb',
    borderColor: '#000000',
    borderWidth: 0.3,
    sortOrder: 'asc',
    style: { fontSize: 10, color: '#000000' },
    headerStyle: { fontSize: 10, fontWeight: 'bold', color: '#374151', backgroundColor: '#f3f4f6' },
    ...overrides,
  } as RepeatingBandElement
}

const sampleRecords = [
  { no: 1, name: 'ノートパソコン', quantity: 2, unitPrice: 128000, amount: 256000 },
  { no: 2, name: 'ディスプレイ 27インチ', quantity: 4, unitPrice: 42000, amount: 168000 },
  { no: 3, name: 'ドッキングステーション', quantity: 2, unitPrice: 18500, amount: 37000 },
  { no: 4, name: 'USB-C ケーブル', quantity: 10, unitPrice: 1200, amount: 12000 },
]

const meta: Meta<typeof RepeatingBandRenderer> = {
  title: 'Elements/RepeatingBand/Renderer',
  component: RepeatingBandRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 600, height: 220, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof RepeatingBandRenderer>

/** Design mode — records is undefined, so faded mock rows are shown */
export const DesignPreview: Story = {
  name: 'デザインプレビュー（records なし）',
  args: {
    element: makeEl(),
  },
}

export const Preview: Story = {
  name: 'ライブプレビュー（records あり）',
  args: {
    element: makeEl(),
    records: sampleRecords,
  },
}

export const WithTotals: Story = {
  name: '合計行付き',
  args: {
    element: makeEl({
      showFooter: true,
      totals: [{ fieldKey: 'amount', formula: 'sum', label: '合計' }],
    }),
    records: sampleRecords,
  },
}
