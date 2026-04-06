import type { Meta, StoryObj } from '@storybook/react'
import { fn } from '@storybook/test'
import { CanvasElement } from './CanvasElement'
import { DndContext } from '@dnd-kit/core'
import type { ReportElement } from '@/types'

const meta: Meta<typeof CanvasElement> = {
  title: 'Canvas/CanvasElement',
  component: CanvasElement,
  parameters: { layout: 'padded' },
  decorators: [
    (Story) => (
      <DndContext>
        <div style={{ position: 'relative', width: 400, height: 300, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
          <Story />
        </div>
      </DndContext>
    ),
  ],
  args: {
    onSelect: fn(),
    onMove: fn(),
    onResize: fn(),
  },
}

export default meta
type Story = StoryObj<typeof CanvasElement>

const textElement: ReportElement = {
  id: 'el-text',
  type: 'text',
  position: { x: 20, y: 20 },
  size: { width: 80, height: 15 },
  zIndex: 1,
  locked: false,
  visible: true,
  content: 'Sample Text Element',
  style: { fontSize: 14, fontWeight: 'normal', color: '#1f2937', textAlign: 'left' },
}

const shapeElement: ReportElement = {
  id: 'el-shape',
  type: 'shape',
  position: { x: 20, y: 60 },
  size: { width: 60, height: 40 },
  zIndex: 1,
  locked: false,
  visible: true,
  shape: 'rectangle',
  fill: '#dbeafe',
  stroke: '#3b82f6',
  strokeWidth: 1,
}

export const Default: Story = {
  args: {
    element: textElement,
    isSelected: false,
    data: {},
    readonly: false,
  },
}

export const Selected: Story = {
  args: {
    element: textElement,
    isSelected: true,
    data: {},
    readonly: false,
  },
}

export const Locked: Story = {
  args: {
    element: { ...textElement, locked: true },
    isSelected: false,
    data: {},
    readonly: false,
  },
}

export const Readonly: Story = {
  args: {
    element: textElement,
    isSelected: false,
    data: {},
    readonly: true,
  },
}

export const ShapeSelected: Story = {
  args: {
    element: shapeElement,
    isSelected: true,
    data: {},
    readonly: false,
  },
}
