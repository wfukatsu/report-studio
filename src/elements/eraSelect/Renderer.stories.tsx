import type { Meta, StoryObj } from '@storybook/react-vite'
import { EraSelectRenderer } from './Renderer'
import type { EraSelectElement } from '@/types'
import { DEFAULT_ERAS } from './constants'

function makeEl(overrides?: Partial<EraSelectElement>): EraSelectElement {
  return {
    id: 'story-eraselect-1',
    type: 'eraSelect',
    position: { x: 0, y: 0 },
    size: { width: 7, height: 12 },
    zIndex: 1,
    visible: true,
    locked: false,
    layout: 'column',
    eras: [...DEFAULT_ERAS],
    ...overrides,
  } as EraSelectElement
}

const meta: Meta<typeof EraSelectRenderer> = {
  title: 'Elements/EraSelect/Renderer',
  component: EraSelectRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 60, height: 140, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof EraSelectRenderer>

/** No selection — all eras shown unmarked */
export const Unselected: Story = {
  name: '未選択（縦一列）',
  args: {
    element: makeEl(),
    data: {},
  },
}

/** dataSource resolves to 令 → 令和 is marked */
export const SelectedReiwa: Story = {
  name: '令和選択（データバインド）',
  args: {
    element: makeEl({ dataSource: 'birth.era' }),
    data: { birth: { era: '令' } },
  },
}

export const RowLayout: Story = {
  name: '横一行レイアウト',
  args: {
    element: makeEl({ layout: 'row', size: { width: 40, height: 6 }, dataSource: 'birth.era' }),
    data: { birth: { era: '昭' } },
  },
  decorators: [
    (Story) => (
      <div style={{ width: 220, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
}
