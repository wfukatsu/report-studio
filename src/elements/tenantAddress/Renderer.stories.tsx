import type { Meta, StoryObj } from '@storybook/react-vite'
import { useEffect } from 'react'
import { TenantAddressRenderer } from './Renderer'
import { useReportStore } from '@/store/reportStore'
import type { TenantAddressElement, TenantInfo } from '@/types'

const SAMPLE_TENANT: TenantInfo = {
  companyName: '株式会社スカラー商事',
  postalCode: '160-0022',
  address1: '東京都新宿区新宿',
  address2: '1-2-3 スカラービル 5F',
}

function TenantSeeder({ info }: { info: TenantInfo | null }) {
  useEffect(() => {
    useReportStore.setState({ tenantInfo: info })
  }, [info])
  return null
}

function makeEl(overrides?: Partial<TenantAddressElement>): TenantAddressElement {
  return {
    id: 'story-tenant-address-1',
    type: 'tenantAddress',
    position: { x: 0, y: 0 },
    size: { width: 80, height: 6 },
    zIndex: 1,
    visible: true,
    locked: false,
    style: { fontSize: 10, color: '#000000', textAlign: 'left' },
    displayMode: 'single',
    ...overrides,
  } as TenantAddressElement
}

const meta: Meta<typeof TenantAddressRenderer> = {
  title: 'Elements/TenantAddress/Renderer',
  component: TenantAddressRenderer,
  decorators: [
    (Story) => (
      <div style={{ width: 340, height: 60, position: 'relative', border: '1px dashed #ccc' }}>
        <Story />
      </div>
    ),
  ],
  parameters: { layout: 'centered' },
}

export default meta
type Story = StoryObj<typeof TenantAddressRenderer>

/** Design mode — literal token placeholder */
export const Design: Story = {
  name: 'デザインモード（トークン表示）',
  render: () => (
    <>
      <TenantSeeder info={null} />
      <TenantAddressRenderer element={makeEl()} />
    </>
  ),
}

export const PreviewSingle: Story = {
  name: 'プレビュー（1行表示）',
  render: () => (
    <>
      <TenantSeeder info={SAMPLE_TENANT} />
      <TenantAddressRenderer element={makeEl()} resolveValues />
    </>
  ),
}

export const PreviewMultiLine: Story = {
  name: 'プレビュー（複数行表示）',
  render: () => (
    <>
      <TenantSeeder info={SAMPLE_TENANT} />
      <TenantAddressRenderer
        element={makeEl({ displayMode: 'multiLine', size: { width: 80, height: 15 } })}
        resolveValues
      />
    </>
  ),
}
