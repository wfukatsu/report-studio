import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { PropertiesPanel } from './PropertiesPanel'
import { useReportStore } from '@/store/reportStore'
import { createTextElement, createShapeElement } from '@/lib/elementFactories'
import type { ReportElement } from '@/types'

const meta: Meta<typeof PropertiesPanel> = {
  title: 'Sidebar/PropertiesPanel',
  component: PropertiesPanel,
  parameters: { layout: 'centered' },
  decorators: [
    (Story) => (
      <div style={{ width: 280, background: '#ffffff', border: '1px solid #e5e7eb', borderRadius: 8, minHeight: 300 }}>
        <Story />
      </div>
    ),
  ],
}

export default meta
type Story = StoryObj<typeof PropertiesPanel>

function SelectElement({ element }: { element: ReportElement }) {
  useEffect(() => {
    const { definition } = useReportStore.getState()
    const page = definition.pages[0]
    if (!page) return
    // Add element to store and select it
    useReportStore.setState((s) => {
      const elements = [element]
      return {
        definition: {
          ...s.definition,
          pages: s.definition.pages.map((p, i) =>
            i === 0
              ? { ...p, sections: [{ ...p.sections[0], elements }] }
              : p,
          ),
        },
        selection: {
          ...s.selection,
          selectedElementIds: [element.id],
        },
      }
    })
  }, [element])
  return null
}

const textEl = createTextElement({ id: 'story-text-el' })
const shapeEl = createShapeElement({ id: 'story-shape-el' })

export const NothingSelected: Story = {
  render: () => {
    useReportStore.setState((s) => ({ selection: { ...s.selection, selectedElementIds: [] } }))
    return <PropertiesPanel />
  },
}

export const TextElementSelected: Story = {
  render: () => (
    <>
      <SelectElement element={textEl} />
      <PropertiesPanel />
    </>
  ),
}

export const ShapeElementSelected: Story = {
  render: () => (
    <>
      <SelectElement element={shapeEl} />
      <PropertiesPanel />
    </>
  ),
}

function MultipleSelectedSetup() {
  useEffect(() => {
    const el1 = createTextElement({ id: 'multi-1' })
    const el2 = createShapeElement({ id: 'multi-2' })
    useReportStore.setState((s) => {
      const elements = [el1, el2]
      return {
        definition: {
          ...s.definition,
          pages: s.definition.pages.map((p, i) =>
            i === 0
              ? { ...p, sections: [{ ...p.sections[0], elements }] }
              : p,
          ),
        },
        selection: { ...s.selection, selectedElementIds: ['multi-1', 'multi-2'] },
      }
    })
  }, [])
  return <PropertiesPanel />
}

export const MultipleSelected: Story = {
  render: () => <MultipleSelectedSetup />,
}
