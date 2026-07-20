import type { Meta, StoryObj } from '@storybook/react-vite'
import { DataFieldRenderer } from './Renderer'
import type { DataFieldElement } from '@/types'

function makeEl(overrides?: Partial<DataFieldElement>): DataFieldElement {
  return {
    id: 'story-datafield-1',
    type: 'dataField',
    position: { x: 0, y: 0 },
    size: { width: 40, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    fieldKey: 'customer.name',
    label: '顧客名',
    style: { fontSize: 10 },
    fallbackText: '',
    ...overrides,
  } as DataFieldElement
}

const meta: Meta<typeof DataFieldRenderer> = {
  title: 'Elements/DataField/Renderer',
  component: DataFieldRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 240, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof DataFieldRenderer>

/** Design mode — no data resolves, so the label placeholder is shown */
export const Placeholder: Story = {
  name: 'プレースホルダー（デザインモード）',
  args: {
    element: makeEl(),
    data: {},
  },
}

export const Resolved: Story = {
  name: '解決済み（プレビュー）',
  args: {
    element: makeEl(),
    data: { customer: { name: '山田太郎' } },
  },
}

export const CurrencyFormat: Story = {
  name: '通貨書式',
  args: {
    element: makeEl({
      fieldKey: 'invoice.total',
      label: '合計金額',
      format: { type: 'currency_jpy' },
      style: { fontSize: 10, textAlign: 'right' },
    }),
    data: { invoice: { total: 1234567 } },
  },
}

/** Design mode with resolved sample data — dotted underline hint */
export const SampleHint: Story = {
  name: 'サンプルヒント付き',
  args: {
    element: makeEl(),
    data: { customer: { name: '山田太郎' } },
    sampleHint: true,
  },
}
