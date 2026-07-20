import type { Meta, StoryObj } from '@storybook/react-vite'
import { HankoRenderer } from './Renderer'
import type { HankoElement } from '@/types'

function makeEl(overrides?: Partial<HankoElement>): HankoElement {
  return {
    id: 'story-hanko-1',
    type: 'hanko',
    position: { x: 0, y: 0 },
    size: { width: 20, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    text: '山田',
    shape: 'circle',
    borderColor: '#cc0000',
    textColor: '#cc0000',
    fontSize: 6,
    writingMode: 'vertical-rl',
    doubleBorder: true,
    ...overrides,
  } as HankoElement
}

const meta: Meta<typeof HankoRenderer> = {
  title: 'Elements/Hanko/Renderer',
  component: HankoRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 100, height: 100, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof HankoRenderer>

export const Circle: Story = {
  name: '丸印（縦書き）',
  args: {
    element: makeEl(),
    data: {},
  },
}

export const Rectangle: Story = {
  name: '角印（横書き）',
  args: {
    element: makeEl({ shape: 'rectangle', text: '承認', writingMode: 'horizontal-tb', doubleBorder: false }),
    data: {},
  },
}

/** binding resolves the stamp text from data */
export const DataBound: Story = {
  name: 'データバインド',
  args: {
    element: makeEl({ binding: 'approver.lastName' }),
    data: { approver: { lastName: '佐藤' } },
  },
}
