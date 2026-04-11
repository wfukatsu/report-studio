import type { Meta, StoryObj } from '@storybook/react'
import { ShapeRenderer } from './Renderer'
import type { ShapeElement } from '@/types'

function makeEl(overrides: Partial<ShapeElement>): ShapeElement {
  return {
    id: 'story-shape-1',
    type: 'shape',
    position: { x: 0, y: 0 },
    size: { width: 60, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    shape: 'rectangle',
    stroke: '#374151',
    strokeWidth: 0.5,
    ...overrides,
  } as ShapeElement
}

const meta: Meta<typeof ShapeRenderer> = {
  title: 'Elements/Shape/Renderer',
  component: ShapeRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 200, height: 100, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof ShapeRenderer>

export const HorizontalLine: Story = {
  name: '水平線',
  args: {
    element: makeEl({ shape: 'line', size: { width: 80, height: 2 }, stroke: '#111827', strokeWidth: 0.5 }),
  },
}

export const VerticalLine: Story = {
  name: '縦線',
  args: {
    element: makeEl({ shape: 'line', size: { width: 2, height: 60 }, stroke: '#111827', strokeWidth: 0.5 }),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 60, height: 180, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
}

export const Rectangle: Story = {
  name: '矩形',
  args: {
    element: makeEl({ shape: 'rectangle', fill: '#dbeafe', stroke: '#3b82f6', strokeWidth: 0.5 }),
  },
}

export const Circle: Story = {
  name: '楕円',
  args: {
    element: makeEl({ shape: 'circle', size: { width: 50, height: 50 }, fill: '#fef3c7', stroke: '#f59e0b', strokeWidth: 0.5 }),
  },
  decorators: [
    (Story) => (
      <div style={{ width: 160, height: 160, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
}

export const RoundedRectangle: Story = {
  name: '角丸矩形',
  args: {
    element: makeEl({ shape: 'rectangle', fill: '#f0fdf4', stroke: '#22c55e', strokeWidth: 0.5, borderRadius: 4 }),
  },
}

export const DashedLine: Story = {
  name: '破線',
  args: {
    element: makeEl({ shape: 'line', strokeDash: 'dashed', size: { width: 80, height: 2 }, stroke: '#6b7280' }),
  },
}
