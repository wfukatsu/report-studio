import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataDetailPanel } from './DataDetailPanel'
import type { Product } from '@/types'

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'p1',
    code: 'SKU-001',
    name: 'テスト商品',
    unitPrice: 1000,
    category: '文具',
    description: '',
    stockCount: 10,
    taxType: 'standard',
    unit: '個',
    manufacturer: 'ACME',
    subscriptionPeriod: null,
    subscriptionPriceUnit: null,
    customFields: {},
    priceHistory: [],
    deletedAt: null,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    version: 1,
    ...overrides,
  }
}

describe('DataDetailPanel', () => {
  it('renders each column with its value', () => {
    render(
      <DataDetailPanel
        row={{ id: 42, name: 'Alpha' }}
        columns={['id', 'name']}
        onClose={() => {}}
      />,
    )
    expect(screen.getByRole('dialog', { name: '行の詳細' })).toBeInTheDocument()
    expect(screen.getByText('42')).toBeInTheDocument()
    expect(screen.getByText('Alpha')).toBeInTheDocument()
  })

  it('formats null as em dash, booleans as true/false and objects as JSON', () => {
    render(
      <DataDetailPanel
        row={{ a: null, b: true, c: { x: 1 } }}
        columns={['a', 'b', 'c']}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('—')).toBeInTheDocument()
    expect(screen.getByText('true')).toBeInTheDocument()
    expect(screen.getByText('{"x":1}')).toBeInTheDocument()
  })

  it('closes via the close button', () => {
    const onClose = vi.fn()
    render(<DataDetailPanel row={{}} columns={[]} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: '閉じる' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape key', () => {
    const onClose = vi.fn()
    render(<DataDetailPanel row={{}} columns={[]} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows the price history section for products with history', () => {
    render(
      <DataDetailPanel
        row={{ id: 'p1' }}
        columns={['id']}
        product={makeProduct({
          priceHistory: [
            { price: 1200, effectiveFrom: '2026-02-01' },
            { price: 1000, effectiveFrom: '2025-01-01' },
          ],
        })}
        onClose={() => {}}
      />,
    )
    expect(screen.getByText('単価変更履歴（2件）')).toBeInTheDocument()
    expect(screen.getByText('1,200円')).toBeInTheDocument()
    expect(screen.getByText('2026-02-01')).toBeInTheDocument()
  })

  it('hides the price history section when the product has no history', () => {
    render(
      <DataDetailPanel
        row={{ id: 'p1' }}
        columns={['id']}
        product={makeProduct()}
        onClose={() => {}}
      />,
    )
    expect(screen.queryByText(/単価変更履歴/)).not.toBeInTheDocument()
  })
})
