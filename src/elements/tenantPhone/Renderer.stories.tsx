import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { TenantPhoneRenderer } from './Renderer'
import { useReportStore } from '@/store/reportStore'
import type { TenantPhoneElement, TenantInfo } from '@/types'

const SAMPLE_TENANT: TenantInfo = { phone: '03-1234-5678' }

function TenantSeeder({ info }: { info: TenantInfo | null }) {
  useEffect(() => {
    useReportStore.setState({ tenantInfo: info })
  }, [info])
  return null
}

function makeEl(overrides?: Partial<TenantPhoneElement>): TenantPhoneElement {
  return {
    id: 'story-tenant-phone-1',
    type: 'tenantPhone',
    position: { x: 0, y: 0 },
    size: { width: 50, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    ...overrides,
  } as TenantPhoneElement
}

const meta: Meta<typeof TenantPhoneRenderer> = {
  title: 'Elements/TenantPhone/Renderer',
  component: TenantPhoneRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 240, height: 40, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof TenantPhoneRenderer>

/** Design mode — literal token placeholder */
export const Design: Story = {
  name: 'デザインモード（トークン表示）',
  render: () => (
    <>
      <TenantSeeder info={null} />
      <TenantPhoneRenderer element={makeEl()} />
    </>
  ),
}

export const Preview: Story = {
  name: 'プレビュー（解決済み）',
  render: () => (
    <>
      <TenantSeeder info={SAMPLE_TENANT} />
      <TenantPhoneRenderer element={makeEl()} resolveValues />
    </>
  ),
}
