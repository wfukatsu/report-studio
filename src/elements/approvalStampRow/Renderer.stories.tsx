import type { Meta, StoryObj } from '@storybook/react-vite'
import { ApprovalStampRowRenderer } from './Renderer'
import type { ApprovalStampRowElement } from '@/types'

function makeEl(overrides?: Partial<ApprovalStampRowElement>): ApprovalStampRowElement {
  return {
    id: 'story-approvalstamprow-1',
    type: 'approvalStampRow',
    position: { x: 0, y: 0 },
    size: { width: 75, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    cells: [
      { role: '担当', width: 15 },
      { role: '係長', width: 15 },
      { role: '課長', width: 15 },
      { role: '部長', width: 15 },
      { role: '社長', width: 15 },
    ],
    labelPosition: 'bottom',
    borderColor: '#000000',
    borderWidth: 0.3,
    cellHeight: 15,
    ...overrides,
  } as ApprovalStampRowElement
}

const meta: Meta<typeof ApprovalStampRowRenderer> = {
  title: 'Elements/ApprovalStampRow/Renderer',
  component: ApprovalStampRowRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 340, height: 100, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof ApprovalStampRowRenderer>

export const FiveRoles: Story = {
  name: '5段（担当〜社長）',
  args: {
    element: makeEl(),
  },
}

export const ThreeRolesLabelTop: Story = {
  name: '3段・ラベル上',
  args: {
    element: makeEl({
      cells: [
        { role: '申請', width: 20 },
        { role: '確認', width: 20 },
        { role: '承認', width: 20 },
      ],
      labelPosition: 'top',
      size: { width: 60, height: 20 },
    }),
  },
}
