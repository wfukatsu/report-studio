import type { Meta, StoryObj } from '@storybook/react-vite'
import { CheckboxRenderer } from './Renderer'
import type { CheckboxElement } from '@/types'

function makeEl(overrides?: Partial<CheckboxElement>): CheckboxElement {
  return {
    id: 'story-checkbox-1',
    type: 'checkbox',
    position: { x: 0, y: 0 },
    size: { width: 30, height: 5 },
    zIndex: 1,
    visible: true,
    locked: false,
    checked: false,
    checkmark: '✓',
    label: '',
    ...overrides,
  } as CheckboxElement
}

const meta: Meta<typeof CheckboxRenderer> = {
  title: 'Elements/Checkbox/Renderer',
  component: CheckboxRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 200, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof CheckboxRenderer>

export const Unchecked: Story = {
  name: '未チェック',
  args: {
    element: makeEl({ label: '同意する' }),
    data: {},
  },
}

export const Checked: Story = {
  name: 'チェック済み',
  args: {
    element: makeEl({ checked: true, label: '利用規約に同意する' }),
    data: {},
  },
}

/** dataSource resolves to a non-empty value → checked */
export const DataBound: Story = {
  name: 'データバインド',
  args: {
    element: makeEl({ dataSource: 'contract.agreed', label: '契約同意', checkmark: '●' }),
    data: { contract: { agreed: 'yes' } },
  },
}
