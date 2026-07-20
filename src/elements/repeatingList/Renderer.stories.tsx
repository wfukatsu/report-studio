import type { Meta, StoryObj } from '@storybook/react-vite'
import { RepeatingListRenderer } from './Renderer'
import type { RepeatingListElement } from '@/types'

function makeEl(overrides?: Partial<RepeatingListElement>): RepeatingListElement {
  return {
    id: 'story-list-1',
    type: 'repeatingList',
    position: { x: 0, y: 0 },
    size: { width: 175, height: 60 },
    zIndex: 1,
    visible: true,
    locked: false,
    dataSource: 'members',
    layout: 'grid',
    gridColumns: 3,
    itemWidth: 55,
    itemHeight: 20,
    gap: 2,
    fields: [
      { key: 'name', label: '名前', x: 2, y: 2, width: 36, height: 5, style: { fontSize: 11, fontWeight: 'bold' } },
      { key: 'title', label: '役職', x: 2, y: 8, width: 36, height: 4, style: { fontSize: 8.5, color: '#6b7280' } },
      { key: 'dept', label: '部署', x: 2, y: 13, width: 36, height: 4, style: { fontSize: 8.5, color: '#6b7280' } },
    ],
    maxItems: 0,
    borderColor: '#d1d5db',
    borderWidth: 0.3,
    itemBackground: '#ffffff',
    borderRadius: 1,
    pageBreak: 'none',
    ...overrides,
  } as RepeatingListElement
}

const sampleRecords = [
  { name: '山田太郎', title: '部長', dept: '営業部' },
  { name: '佐藤花子', title: '課長', dept: '経理部' },
  { name: '鈴木一郎', title: '主任', dept: '開発部' },
  { name: '田中美咲', title: '担当', dept: '総務部' },
]

const meta: Meta<typeof RepeatingListRenderer> = {
  title: 'Elements/RepeatingList/Renderer',
  component: RepeatingListRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 600, height: 220, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof RepeatingListRenderer>

/** Design mode — records is undefined, so a design placeholder is shown */
export const DesignPreview: Story = {
  name: 'デザインプレビュー（records なし）',
  args: {
    element: makeEl(),
  },
}

export const PreviewGrid: Story = {
  name: 'グリッドレイアウト（records あり）',
  args: {
    element: makeEl(),
    records: sampleRecords,
  },
}

export const PreviewVertical: Story = {
  name: '縦一列レイアウト',
  args: {
    element: makeEl({ layout: 'vertical', itemWidth: 80 }),
    records: sampleRecords.slice(0, 2),
  },
}
