import type { Meta, StoryObj } from '@storybook/react-vite'
import { ImageRenderer } from './Renderer'
import type { ImageElement } from '@/types'

// 1x1 red pixel PNG (safe data URI)
const RED_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function makeEl(overrides?: Partial<ImageElement>): ImageElement {
  return {
    id: 'story-image-1',
    type: 'image',
    position: { x: 0, y: 0 },
    size: { width: 40, height: 26 },
    zIndex: 1,
    visible: true,
    locked: false,
    src: '',
    alt: 'サンプル画像',
    objectFit: 'contain',
    opacity: 1,
    ...overrides,
  } as ImageElement
}

const meta: Meta<typeof ImageRenderer> = {
  title: 'Elements/Image/Renderer',
  component: ImageRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 160, height: 104, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof ImageRenderer>

/** No src — placeholder is shown */
export const Placeholder: Story = {
  name: 'プレースホルダー（src なし）',
  args: {
    element: makeEl(),
  },
}

export const WithImage: Story = {
  name: '画像あり（fill）',
  args: {
    element: makeEl({ src: RED_PIXEL_PNG, objectFit: 'fill' }),
  },
}

export const HalfOpacity: Story = {
  name: '半透明',
  args: {
    element: makeEl({ src: RED_PIXEL_PNG, objectFit: 'fill', opacity: 0.4 }),
  },
}
