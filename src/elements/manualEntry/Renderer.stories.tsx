import type { Meta, StoryObj } from '@storybook/react-vite'
import { ManualEntryRenderer } from './Renderer'
import type { ManualEntryField } from '@/types'

function makeEl(overrides?: Partial<ManualEntryField>): ManualEntryField {
  return {
    id: 'story-manualentry-1',
    type: 'manualEntry',
    position: { x: 0, y: 0 },
    size: { width: 60, height: 8 },
    zIndex: 1,
    visible: true,
    locked: false,
    label: 'お名前',
    labelPosition: 'top',
    displayMode: 'line',
    lineColor: '#000000',
    placeholder: '（記入）',
    style: { fontSize: 10, color: '#000000' },
    ...overrides,
  } as ManualEntryField
}

const meta: Meta<typeof ManualEntryRenderer> = {
  title: 'Elements/ManualEntry/Renderer',
  component: ManualEntryRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 260, height: 70, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof ManualEntryRenderer>

export const Line: Story = {
  name: '下線タイプ',
  args: {
    element: makeEl(),
  },
}

export const Box: Story = {
  name: '枠タイプ',
  args: {
    element: makeEl({ displayMode: 'box', label: '住所', labelPosition: 'left' }),
  },
}

export const Grid: Story = {
  name: 'マス目タイプ',
  args: {
    element: makeEl({ displayMode: 'grid', gridCount: 7, label: 'フリガナ', placeholder: '' }),
  },
}

export const WithFurigana: Story = {
  name: 'フリガナゾーン付き',
  args: {
    element: makeEl({
      furiganaEnabled: true,
      furiganaDataSource: 'customer.kana',
      label: 'お名前',
    }),
    data: { customer: { kana: 'ヤマダタロウ' } },
  },
}
