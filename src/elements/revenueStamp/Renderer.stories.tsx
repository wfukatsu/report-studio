import type { Meta, StoryObj } from '@storybook/react-vite'
import { RevenueStampRenderer } from './Renderer'
import type { RevenueStampElement } from '@/types'

function makeEl(overrides?: Partial<RevenueStampElement>): RevenueStampElement {
  return {
    id: 'story-revenuestamp-1',
    type: 'revenueStamp',
    position: { x: 0, y: 0 },
    size: { width: 40, height: 25 },
    zIndex: 1,
    visible: true,
    locked: false,
    borderColor: '#000000',
    borderWidth: 0.3,
    showLabel: true,
    showCancellationGuide: true,
    ...overrides,
  } as RevenueStampElement
}

const meta: Meta<typeof RevenueStampRenderer> = {
  title: 'Elements/RevenueStamp/Renderer',
  component: RevenueStampRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 180, height: 120, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof RevenueStampRenderer>

export const Default: Story = {
  name: '標準（消印ガイド付き）',
  args: {
    element: makeEl(),
  },
}

export const WithAmount: Story = {
  name: '印紙税額表示',
  args: {
    element: makeEl({ amount: '200円' }),
  },
}

export const Minimal: Story = {
  name: '枠のみ',
  args: {
    element: makeEl({ showLabel: false, showCancellationGuide: false }),
  },
}
