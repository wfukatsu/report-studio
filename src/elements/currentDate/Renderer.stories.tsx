import type { Meta, StoryObj } from '@storybook/react-vite'
import { CurrentDateRenderer } from './Renderer'
import type { CurrentDateElement } from '@/types'

function makeEl(overrides?: Partial<CurrentDateElement>): CurrentDateElement {
  return {
    id: 'story-currentdate-1',
    type: 'currentDate',
    position: { x: 0, y: 0 },
    size: { width: 40, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    format: 'yyyy年MM月dd日',
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    ...overrides,
  } as CurrentDateElement
}

const meta: Meta<typeof CurrentDateRenderer> = {
  title: 'Elements/CurrentDate/Renderer',
  component: CurrentDateRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 220, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof CurrentDateRenderer>

/** Design mode — format placeholder shown instead of the actual date */
export const DesignPlaceholder: Story = {
  name: 'デザインモード（書式表示）',
  args: {
    element: makeEl(),
    resolveValues: false,
  },
}

export const Resolved: Story = {
  name: 'プレビュー（本日日付）',
  args: {
    element: makeEl(),
    resolveValues: true,
  },
}

export const WarekiFull: Story = {
  name: '和暦（令和）',
  args: {
    element: makeEl({ format: 'wareki_full' }),
    resolveValues: true,
  },
}
