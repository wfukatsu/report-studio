import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { TenantRepresentativeRenderer } from './Renderer'
import { useReportStore } from '@/store/reportStore'
import type { TenantRepresentativeElement, TenantInfo } from '@/types'

const SAMPLE_TENANT: TenantInfo = { representativeName: '代表取締役 山田太郎' }

function TenantSeeder({ info }: { info: TenantInfo | null }) {
  useEffect(() => {
    useReportStore.setState({ tenantInfo: info })
  }, [info])
  return null
}

function makeEl(overrides?: Partial<TenantRepresentativeElement>): TenantRepresentativeElement {
  return {
    id: 'story-tenant-representative-1',
    type: 'tenantRepresentative',
    position: { x: 0, y: 0 },
    size: { width: 50, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    ...overrides,
  } as TenantRepresentativeElement
}

const meta: Meta<typeof TenantRepresentativeRenderer> = {
  title: 'Elements/TenantRepresentative/Renderer',
  component: TenantRepresentativeRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 280, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof TenantRepresentativeRenderer>

/** Design mode — literal token placeholder */
export const Design: Story = {
  name: 'デザインモード（トークン表示）',
  render: () => (
    <>
      <TenantSeeder info={null} />
      <TenantRepresentativeRenderer element={makeEl()} />
    </>
  ),
}

export const Preview: Story = {
  name: 'プレビュー（解決済み）',
  render: () => (
    <>
      <TenantSeeder info={SAMPLE_TENANT} />
      <TenantRepresentativeRenderer element={makeEl()} resolveValues />
    </>
  ),
}
