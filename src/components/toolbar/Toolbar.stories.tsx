import type { Meta, StoryObj } from '@storybook/react'
import { useRef } from 'react'
import { Toolbar } from './Toolbar'
import { useReportStore } from '@/store/reportStore'

const meta: Meta<typeof Toolbar> = {
  title: 'Toolbar/Toolbar',
  component: Toolbar,
  parameters: { layout: 'fullscreen' },
}

export default meta
type Story = StoryObj<typeof Toolbar>

function ToolbarWithRefs() {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div ref={ref} style={{ background: '#f9fafb' }}>
      <Toolbar canvasRefs={[ref]} />
    </div>
  )
}

export const Default: Story = {
  render: () => <ToolbarWithRefs />,
}

export const WithHistory: Story = {
  render: () => {
    useReportStore.setState((s) => ({
      history: [...s.history, { pages: s.definition.pages }, { pages: s.definition.pages }],
      historyIndex: 2,
    }))
    return <ToolbarWithRefs />
  },
}

export const PreviewMode: Story = {
  render: () => {
    useReportStore.setState({ previewMode: true })
    return <ToolbarWithRefs />
  },
}
