import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ProductMasterModal } from './ProductMasterModal'
import { tk } from '@/test/i18n'

// The dedicated editor is exercised by its own tests; here we only verify the
// modal shell wiring (title, close affordances) without pulling in the store /
// API dependencies of ProductMasterTab.
vi.mock('@/components/modals/ProductMasterTab', () => ({
  ProductMasterTab: () => <div data-testid="product-master-tab" />,
}))

describe('ProductMasterModal', () => {
  it('renders the dialog with the master editor and a title', () => {
    render(<ProductMasterModal onClose={vi.fn()} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText(tk('components:dataBrowser.productMasterModal.title'))).toBeInTheDocument()
    expect(screen.getByTestId('product-master-tab')).toBeInTheDocument()
  })

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn()
    render(<ProductMasterModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: tk('components:dataBrowser.productMasterModal.close') }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn()
    render(<ProductMasterModal onClose={onClose} />)
    fireEvent.click(screen.getByRole('dialog'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('does not close when the modal body is clicked', () => {
    const onClose = vi.fn()
    render(<ProductMasterModal onClose={onClose} />)
    fireEvent.click(screen.getByTestId('product-master-tab'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(<ProductMasterModal onClose={onClose} />)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
