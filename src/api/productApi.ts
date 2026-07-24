/**
 * Product Master API — product CRUD, custom field definitions, CSV import.
 */
import { apiFetch } from './client'
import i18n from '@/i18n/config'
import {
  ProductSchema,
  ProductListSchema,
  ProductCustomFieldDefsSchema,
} from '@/lib/schemas/product'
import type { Product, ProductCustomFieldDef, CreateProductRequest, UpdateProductPayload } from '@/types'

// ---------------------------------------------------------------------------
// Product Master
// ---------------------------------------------------------------------------

/** Error thrown when a product code is already in use (409 Conflict). */
export class DuplicateCodeError extends Error {
  constructor() {
    super(i18n.t('serverErrors:store.productDuplicateCode'))
    this.name = 'DuplicateCodeError'
  }
}

/** Error thrown on optimistic concurrency conflict (409 version mismatch). */
export class VersionConflictError extends Error {
  constructor() {
    super(i18n.t('serverErrors:store.productVersionConflict'))
    this.name = 'VersionConflictError'
  }
}

/** GET /api/v1/products — returns all active (non-deleted) products */
export async function getProducts(): Promise<Product[]> {
  return apiFetch('/api/v1/products', ProductListSchema) as Promise<Product[]>
}

/** GET /api/v1/products/{id} — returns a single product */
export async function getProduct(id: string): Promise<Product> {
  return apiFetch(`/api/v1/products/${encodeURIComponent(id)}`, ProductSchema) as Promise<Product>
}

/** POST /api/v1/products — creates a new product */
export async function createProduct(p: CreateProductRequest): Promise<Product> {
  const res = await fetch('/api/v1/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(p),
    credentials: 'include',
  })
  if (res.status === 409) throw new DuplicateCodeError()
  if (!res.ok) throw new Error(`POST /api/v1/products failed: ${res.status}`)
  return ProductSchema.parse(await res.json())
}

/** PUT /api/v1/products/{id} — updates an existing product */
export async function updateProduct(
  id: string,
  patch: UpdateProductPayload,
  expectedVersion: number,
): Promise<Product> {
  const res = await fetch(`/api/v1/products/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': String(expectedVersion),
    },
    body: JSON.stringify(patch),
    credentials: 'include',
  })
  if (res.status === 409) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string }
    // #267 unified error format carries the machine-readable code in `code`;
    // older servers put it in `error` — accept both for backward compatibility.
    if (body.code === 'VERSION_CONFLICT' || body.error === 'VERSION_CONFLICT') {
      throw new VersionConflictError()
    }
    throw new DuplicateCodeError()
  }
  if (!res.ok) throw new Error(`PUT /api/v1/products/${id} failed: ${res.status}`)
  return ProductSchema.parse(await res.json())
}

/** DELETE /api/v1/products/{id} — soft-deletes a product */
export async function deleteProduct(id: string): Promise<void> {
  const res = await fetch(`/api/v1/products/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok && res.status !== 404 && res.status !== 410) {
    throw new Error(`DELETE /api/v1/products/${id} failed: ${res.status}`)
  }
}

/** GET /api/v1/products/fields — returns custom field definitions */
export async function getProductCustomFieldDefs(): Promise<ProductCustomFieldDef[]> {
  return apiFetch('/api/v1/products/fields', ProductCustomFieldDefsSchema) as Promise<ProductCustomFieldDef[]>
}

/** PUT /api/v1/products/fields — replaces custom field definitions */
export async function putProductCustomFieldDefs(
  defs: ProductCustomFieldDef[],
): Promise<ProductCustomFieldDef[]> {
  return apiFetch('/api/v1/products/fields', ProductCustomFieldDefsSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(defs),
  }) as Promise<ProductCustomFieldDef[]>
}

/** POST /api/v1/products/import — bulk import from CSV text */
export async function importProductsCsv(csvText: string): Promise<{
  imported: number
  skipped: number
  /** `reason` is the ja server wording; `reasonCode` is the UPPER_SNAKE code for i18n (#412). */
  errors: { row: number; column: string; value: string; reason: string; reasonCode?: string }[]
}> {
  const res = await fetch('/api/v1/products/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csv: csvText }),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Import failed: ${res.status}`)
  }
  return res.json()
}
