import type { Meta, StoryObj } from '@storybook/react'
import { ChartRenderer } from './Renderer'
import type { ChartElement } from '@/types'

function makeEl(overrides: Partial<ChartElement>): ChartElement {
  return {
    id: 'story-chart-1',
    type: 'chart',
    position: { x: 0, y: 0 },
    size: { width: 80, height: 60 },
    zIndex: 1,
    visible: true,
    locked: false,
    chartType: 'bar',
    ...overrides,
  } as ChartElement
}

const sampleData = [
  { name: '1月', value: 120 },
  { name: '2月', value: 85 },
  { name: '3月', value: 150 },
  { name: '4月', value: 95 },
]

const meta: Meta<typeof ChartRenderer> = {
  title: 'Elements/Chart/Renderer',
  component: ChartRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 280, height: 200, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof ChartRenderer>

export const Bar: Story = {
  name: '棒グラフ',
  args: {
    element: makeEl({ chartType: 'bar', dataBinding: 'sales', title: '月次売上' }),
    data: { sales: sampleData },
  },
}

export const Line: Story = {
  name: '折れ線グラフ',
  args: {
    element: makeEl({ chartType: 'line', dataBinding: 'sales' }),
    data: { sales: sampleData },
  },
}

export const Pie: Story = {
  name: '円グラフ',
  args: {
    element: makeEl({ chartType: 'pie', dataBinding: 'sales' }),
    data: { sales: sampleData },
  },
}

export const Donut: Story = {
  name: 'ドーナツグラフ',
  args: {
    element: makeEl({ chartType: 'donut', dataBinding: 'sales' }),
    data: { sales: sampleData },
  },
}

/** Design mode — no data binding, shows sample data */
export const NoData: Story = {
  name: 'データなし（サンプル表示）',
  args: {
    element: makeEl({ chartType: 'bar' }),
    data: {},
  },
}

export const CustomColors: Story = {
  name: 'カスタムカラー',
  args: {
    element: makeEl({
      chartType: 'bar',
      dataBinding: 'sales',
      colors: ['#6366f1', '#8b5cf6', '#a78bfa', '#c4b5fd'],
    }),
    data: { sales: sampleData },
  },
}
