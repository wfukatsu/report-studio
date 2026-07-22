/**
 * Product Master slice — manages the tenant-wide product catalog.
 *
 * State is fetched on demand (when the ProductMasterTab first opens).
 * This slice sits outside the undo/redo history — products are not part of
 * any individual template definition.
 *
 * Race-condition mitigation:
 * - fetchSeq: monotonically incrementing counter to discard stale responses.
 * - productOps: per-entity operation lock to prevent double-fire on rapid clicks.
 */

import type { StateCreator } from 'zustand'
import i18n from '@/i18n/config'
import type {
  ProductCustomFieldDef,
  CreateProductRequest,
  UpdateProductPayload,
} from '@/types'
import type { StoreState } from './types'
import {
  getProducts,
  createProduct,
  updateProduct as apiUpdateProduct,
  deleteProduct as apiDeleteProduct,
  getProductCustomFieldDefs,
  putProductCustomFieldDefs,
} from '@/api/reportApi'

export type ProductSlice = Pick<StoreState,
  | 'products'
  | 'customFieldDefs'
  | 'productsLoading'
  | 'productsError'
  | 'productOps'
  | 'fetchProducts'
  | 'addProduct'
  | 'updateProduct'
  | 'deleteProduct'
  | 'fetchCustomFieldDefs'
  | 'updateCustomFieldDefs'
  | 'setProductOp'
>

let _fetchSeq = 0

export const createProductSlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  ProductSlice
> = (set) => ({
  products: [],
  customFieldDefs: [],
  productsLoading: false,
  productsError: null,
  productOps: new Map(),

  fetchProducts: async () => {
    const seq = ++_fetchSeq
    set((s) => { s.productsLoading = true; s.productsError = null })
    try {
      const data = await getProducts()
      set((s) => {
        if (_fetchSeq !== seq) return // stale response — discard
        s.products = data
        s.productsLoading = false
      })
    } catch (err) {
      set((s) => {
        if (_fetchSeq !== seq) return
        s.productsLoading = false
        s.productsError = err instanceof Error ? err.message : i18n.t('serverErrors:store.productsLoadFailed')
      })
    }
  },

  addProduct: async (p: CreateProductRequest) => {
    const created = await createProduct(p)
    set((s) => {
      s.products = [...s.products, created]
    })
    return created
  },

  updateProduct: async (id: string, patch: UpdateProductPayload, expectedVersion: number) => {
    const updated = await apiUpdateProduct(id, patch, expectedVersion)
    set((s) => {
      s.products = s.products.map((p) => (p.id === id ? updated : p))
    })
  },

  deleteProduct: async (id: string) => {
    await apiDeleteProduct(id)
    set((s) => {
      s.products = s.products.filter((p) => p.id !== id)
    })
  },

  fetchCustomFieldDefs: async () => {
    try {
      const defs = await getProductCustomFieldDefs()
      set((s) => { s.customFieldDefs = defs })
    } catch (err) {
      console.error('[productSlice] fetchCustomFieldDefs failed:', err)
    }
  },

  updateCustomFieldDefs: async (defs: ProductCustomFieldDef[]) => {
    const updated = await putProductCustomFieldDefs(defs)
    set((s) => { s.customFieldDefs = updated })
  },

  setProductOp: (id: string, op: 'idle' | 'saving' | 'deleting') => {
    set((s) => {
      const newMap = new Map(s.productOps)
      if (op === 'idle') {
        newMap.delete(id)
      } else {
        newMap.set(id, op)
      }
      s.productOps = newMap
    })
  },
})
