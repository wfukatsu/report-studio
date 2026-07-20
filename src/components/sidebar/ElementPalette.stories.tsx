import type { Meta, StoryObj } from '@storybook/react-vite'
import { ElementPalette } from './ElementPalette'

const meta: Meta<typeof ElementPalette> = {
  title: 'Sidebar/ElementPalette',
  component: ElementPalette,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 200, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8 }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof ElementPalette>

export const Default: Story = {}
