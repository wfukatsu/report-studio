import type { Meta, StoryObj } from '@storybook/react'
import { useEffect } from 'react'
import { ReportCanvas } from './ReportCanvas'
import { useReportStore } from '@/store/reportStore'
import { createTextElement, createShapeElement, createFormTableElement } from '@/lib/elementFactories'
import type { ReportElement } from '@/types'

const meta: Meta<typeof ReportCanvas> = {
  title: 'Canvas/ReportCanvas',
  component: ReportCanvas,
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof ReportCanvas>

function StoreSeeder({ elements }: { elements: ReportElement[] }) {
  useEffect(() => {
    const { definition } = useReportStore.getState()
    const page = definition.pages[0]
    if (!page) return
    // Reset to empty page then inject elements
    useReportStore.setState((s) => ({
      definition: {
        ...s.definition,
        pages: s.definition.pages.map((p, i) =>
          i === 0
            ? { ...p, sections: [{ ...p.sections[0], elements }] }
            : p,
        ),
      },
    }))
  }, [elements])
  return null
}

const textEl = createTextElement({ position: { x: 10, y: 10 }, content: 'Report Title' })
const shapeEl = createShapeElement({ position: { x: 10, y: 30 }, size: { width: 80, height: 3 }, shape: 'line', stroke: '#374151', strokeWidth: 1 })
const tableEl = createFormTableElement({ position: { x: 10, y: 45 }, size: { width: 180, height: 60 } })

export const Empty: Story = {
  render: () => (
    <>
      <StoreSeeder elements={[]} />
      <ReportCanvas />
    </>
  ),
}

export const WithElements: Story = {
  render: () => (
    <>
      <StoreSeeder elements={[textEl, shapeEl, tableEl]} />
      <ReportCanvas />
    </>
  ),
}

export const Readonly: Story = {
  render: () => (
    <>
      <StoreSeeder elements={[textEl, shapeEl]} />
      <ReportCanvas readonly />
    </>
  ),
}
