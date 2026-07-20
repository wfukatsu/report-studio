import type { Meta, StoryObj } from '@storybook/react-vite'
import { PageNumberRenderer } from './Renderer'
import type { PageNumberElement } from '@/types'

function makeEl(overrides?: Partial<PageNumberElement>): PageNumberElement {
  return {
    id: 'story-pagenumber-1',
    type: 'pageNumber',
    position: { x: 0, y: 0 },
    size: { width: 30, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    format: '{{page}} / {{pages}}',
    style: { fontSize: 8.5, color: '#666666', textAlign: 'center' },
    ...overrides,
  } as PageNumberElement
}

const meta: Meta<typeof PageNumberRenderer> = {
  title: 'Elements/PageNumber/Renderer',
  component: PageNumberRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 160, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof PageNumberRenderer>

/** Design mode — template tokens shown as-is */
export const DesignToken: Story = {
  name: 'デザインモード（トークン表示）',
  args: {
    element: makeEl(),
    resolveValues: false,
  },
}

export const Resolved: Story = {
  name: 'プレビュー（解決済み）',
  args: {
    element: makeEl(),
    resolveValues: true,
    pageIndex: 2,
    totalPages: 5,
  },
}

export const JapaneseFormat: Story = {
  name: '日本語書式',
  args: {
    element: makeEl({ format: '{{page}}ページ' }),
    resolveValues: true,
    pageIndex: 3,
    totalPages: 10,
  },
}
