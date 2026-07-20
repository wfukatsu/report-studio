import type { Meta, StoryObj } from '@storybook/react-vite'
import { DividerRenderer } from './Renderer'
import type { DividerElement } from '@/types'

function makeEl(overrides?: Partial<DividerElement>): DividerElement {
  return {
    id: 'story-divider-1',
    type: 'divider',
    position: { x: 0, y: 0 },
    size: { width: 170, height: 0.5 },
    zIndex: 1,
    visible: true,
    locked: false,
    direction: 'horizontal',
    color: '#000000',
    thickness: 0.3,
    dashStyle: 'solid',
    ...overrides,
  } as DividerElement
}

const meta: Meta<typeof DividerRenderer> = {
  title: 'Elements/Divider/Renderer',
  component: DividerRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 300, height: 20, position: 'relative', border: '1px dashed #eee' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof DividerRenderer>

export const Horizontal: Story = {
  name: '水平線',
  args: {
    element: makeEl(),
  },
}

export const Dashed: Story = {
  name: '破線',
  args: {
    element: makeEl({ dashStyle: 'dashed', color: '#6b7280' }),
  },
}

export const Vertical: Story = {
  name: '縦線',
  args: {
    element: makeEl({ direction: 'vertical', size: { width: 0.5, height: 60 }, thickness: 0.5 }),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 20, height: 180, position: 'relative', border: '1px dashed #eee' }}>
        <Story />
      </div>
    ),
  ],
}
