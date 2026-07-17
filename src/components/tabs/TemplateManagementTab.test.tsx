import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { useReportStore } from '@/store'
import { TemplateManagementTab } from './TemplateManagementTab'

// Content components carry their own heavy dependencies — stub them so the
// test verifies section persistence and switching only.
vi.mock('@/components/modals/TemplateManagerModal', () => ({
  TemplateManagerContent: () => <div>STUB-TEMPLATE-MANAGER</div>,
}))
vi.mock('@/components/modals/VariantsModal', () => ({
  VariantList: () => <div>STUB-VARIANT-LIST</div>,
}))

beforeEach(() => {
  useReportStore.setState({ templateActiveSection: 'templates' } as never)
})

describe('TemplateManagementTab', () => {
  it('shows the template list by default', () => {
    render(<TemplateManagementTab />)
    expect(screen.getByText('STUB-TEMPLATE-MANAGER')).toBeInTheDocument()
    expect(screen.queryByText('STUB-VARIANT-LIST')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'テンプレート一覧' }).className).toContain('border-primary')
  })

  it('switches to variants and persists the section in the store', () => {
    render(<TemplateManagementTab />)
    fireEvent.click(screen.getByRole('button', { name: 'バリアント設定' }))
    expect(screen.getByText('STUB-VARIANT-LIST')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'バリアント設定' })).toBeInTheDocument()
    expect(screen.queryByText('STUB-TEMPLATE-MANAGER')).not.toBeInTheDocument()
    expect(useReportStore.getState().templateActiveSection).toBe('variants')
  })

  it('restores the active section from the store', () => {
    useReportStore.setState({ templateActiveSection: 'variants' } as never)
    render(<TemplateManagementTab />)
    expect(screen.getByText('STUB-VARIANT-LIST')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'バリアント設定' }).className).toContain('border-primary')
  })
})
