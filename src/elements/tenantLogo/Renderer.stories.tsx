import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { TenantLogoRenderer } from './Renderer'
import { useReportStore } from '@/store/reportStore'
import type { TenantLogoElement, TenantInfo } from '@/types'

// 1x1 blue pixel PNG (safe data URI)
const BLUE_PIXEL_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPj/HwADBwIAMCbHYQAAAABJRU5ErkJggg=='

const SAMPLE_TENANT: TenantInfo = { logoBase64: BLUE_PIXEL_PNG }

function TenantSeeder({ info }: { info: TenantInfo | null }) {
  useEffect(() => {
    useReportStore.setState({ tenantInfo: info })
  }, [info])
  return null
}

function makeEl(overrides?: Partial<TenantLogoElement>): TenantLogoElement {
  return {
    id: 'story-tenant-logo-1',
    type: 'tenantLogo',
    position: { x: 0, y: 0 },
    size: { width: 30, height: 20 },
    zIndex: 1,
    visible: true,
    locked: false,
    objectFit: 'contain',
    opacity: 1,
    ...overrides,
  } as TenantLogoElement
}

const meta: Meta<typeof TenantLogoRenderer> = {
  title: 'Elements/TenantLogo/Renderer',
  component: TenantLogoRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 150, height: 100, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof TenantLogoRenderer>

/** No logo configured — placeholder is shown */
export const Placeholder: Story = {
  name: 'ロゴ未設定',
  render: () => (
    <>
      <TenantSeeder info={null} />
      <TenantLogoRenderer element={makeEl()} />
    </>
  ),
}

export const WithLogo: Story = {
  name: 'ロゴあり（fill）',
  render: () => (
    <>
      <TenantSeeder info={SAMPLE_TENANT} />
      <TenantLogoRenderer element={makeEl({ objectFit: 'fill' })} />
    </>
  ),
}
