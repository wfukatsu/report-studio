/**
 * productSlice — product master catalog actions (#223).
 *
 * API layer mocked; real store wiring runs. Focus: CRUD state transitions, the
 * fetchSeq stale-response guard (a slow first fetch must not clobber a newer
 * one), and the per-entity operation lock map.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { useReportStore } from '@/store'

vi.mock('@/api/reportApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/reportApi')>()
  return {
    ...actual,
    getProducts: vi.fn(),
    createProduct: vi.fn(),
    updateProduct: vi.fn(),
    deleteProduct: vi.fn(),
    getProductCustomFieldDefs: vi.fn(),
    putProductCustomFieldDefs: vi.fn(),
  }
})

import {
  getProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductCustomFieldDefs,
  putProductCustomFieldDefs,
} from '@/api/reportApi'

const PROD_A = { id: 'a', name: 'Apple', version: 1 }
const PROD_B = { id: 'b', name: 'Banana', version: 1 }

beforeEach(() => {
  vi.clearAllMocks()
  useReportStore.setState({
    products: [],
    customFieldDefs: [],
    productsLoading: false,
    productsError: null,
    productOps: new Map(),
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('productSlice — fetchProducts', () => {
  it('stores products and clears loading on success', async () => {
    vi.mocked(getProducts).mockResolvedValue([PROD_A, PROD_B] as never)
    await useReportStore.getState().fetchProducts()
    expect(useReportStore.getState().products).toEqual([PROD_A, PROD_B])
    expect(useReportStore.getState().productsLoading).toBe(false)
  })

  it('records the error message on failure', async () => {
    vi.mocked(getProducts).mockRejectedValue(new Error('offline'))
    await useReportStore.getState().fetchProducts()
    expect(useReportStore.getState().productsError).toBe('offline')
    expect(useReportStore.getState().productsLoading).toBe(false)
  })

  it('discards a stale response when a newer fetch has superseded it', async () => {
    // First fetch resolves LAST with stale data; the guard must drop it.
    let resolveFirst: (v: unknown) => void = () => {}
    const first = new Promise((r) => {
      resolveFirst = r
    })
    vi.mocked(getProducts)
      .mockReturnValueOnce(first as never)
      .mockResolvedValueOnce([PROD_B] as never)

    const p1 = useReportStore.getState().fetchProducts() // seq = n+1
    const p2 = useReportStore.getState().fetchProducts() // seq = n+2 (wins)
    await p2
    expect(useReportStore.getState().products).toEqual([PROD_B])

    resolveFirst([PROD_A]) // late stale response
    await p1
    expect(useReportStore.getState().products).toEqual([PROD_B]) // unchanged
  })
})

describe('productSlice — add/update/delete', () => {
  it('addProduct appends the created product and returns it', async () => {
    useReportStore.setState({ products: [PROD_A] as never })
    vi.mocked(createProduct).mockResolvedValue(PROD_B as never)
    const created = await useReportStore.getState().addProduct({ name: 'Banana' } as never)
    expect(created).toEqual(PROD_B)
    expect(useReportStore.getState().products).toEqual([PROD_A, PROD_B])
  })

  it('updateProduct replaces the matching product with the API result', async () => {
    useReportStore.setState({ products: [PROD_A, PROD_B] as never })
    const updated = { ...PROD_A, name: 'Apricot', version: 2 }
    vi.mocked(updateProduct).mockResolvedValue(updated as never)
    await useReportStore.getState().updateProduct('a', { name: 'Apricot' } as never, 1)
    expect(useReportStore.getState().products).toEqual([updated, PROD_B])
    expect(updateProduct).toHaveBeenCalledWith('a', { name: 'Apricot' }, 1)
  })

  it('deleteProduct removes the matching product', async () => {
    useReportStore.setState({ products: [PROD_A, PROD_B] as never })
    vi.mocked(deleteProduct).mockResolvedValue(undefined as never)
    await useReportStore.getState().deleteProduct('a')
    expect(useReportStore.getState().products).toEqual([PROD_B])
  })
})

describe('productSlice — custom field defs', () => {
  it('fetchCustomFieldDefs stores the defs', async () => {
    vi.mocked(getProductCustomFieldDefs).mockResolvedValue([{ key: 'sku', label: 'SKU' }] as never)
    await useReportStore.getState().fetchCustomFieldDefs()
    expect(useReportStore.getState().customFieldDefs).toEqual([{ key: 'sku', label: 'SKU' }])
  })

  it('fetchCustomFieldDefs swallows errors (logs, keeps prior state)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    useReportStore.setState({ customFieldDefs: [{ key: 'old' }] as never })
    vi.mocked(getProductCustomFieldDefs).mockRejectedValue(new Error('x'))
    await useReportStore.getState().fetchCustomFieldDefs()
    expect(useReportStore.getState().customFieldDefs).toEqual([{ key: 'old' }])
    expect(spy).toHaveBeenCalled()
  })

  it('updateCustomFieldDefs stores the persisted defs from the API', async () => {
    vi.mocked(putProductCustomFieldDefs).mockResolvedValue([{ key: 'new' }] as never)
    await useReportStore.getState().updateCustomFieldDefs([{ key: 'new' }] as never)
    expect(useReportStore.getState().customFieldDefs).toEqual([{ key: 'new' }])
  })
})

describe('productSlice — setProductOp lock map', () => {
  it('sets and clears a per-entity operation', () => {
    useReportStore.getState().setProductOp('a', 'saving')
    expect(useReportStore.getState().productOps.get('a')).toBe('saving')

    useReportStore.getState().setProductOp('a', 'deleting')
    expect(useReportStore.getState().productOps.get('a')).toBe('deleting')

    useReportStore.getState().setProductOp('a', 'idle')
    expect(useReportStore.getState().productOps.has('a')).toBe(false)
  })

  it('produces a new Map instance each call (immutable update)', () => {
    const before = useReportStore.getState().productOps
    useReportStore.getState().setProductOp('a', 'saving')
    expect(useReportStore.getState().productOps).not.toBe(before)
  })
})
