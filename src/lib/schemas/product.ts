import { z } from 'zod'
import type { Product, ProductCustomFieldDef, ProductMasterDefinition } from '@/types'

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

const SAFE_KEY_RE = /^[a-zA-Z0-9_-]+$/

export const PriceHistoryEntrySchema = z.object({
  price: z.number().nonnegative(),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'effectiveFrom must be YYYY-MM-DD'),
})

export const ProductCustomFieldDefSchema = z.object({
  key: z
    .string()
    .min(1)
    .max(64)
    .regex(SAFE_KEY_RE, 'key must be alphanumeric, hyphen, or underscore')
    .refine(
      (k) => !['__proto__', 'constructor', 'prototype'].includes(k),
      'Reserved key name',
    ),
  label: z.string().min(1).max(100),
  type: z.enum(['text', 'number', 'date', 'boolean']),
})

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export const ProductSchema = z.object({
  id: z.string().uuid(),
  code: z
    .string()
    .min(1)
    .max(64)
    .regex(SAFE_KEY_RE, 'code must be alphanumeric, hyphen, or underscore'),
  name: z.string().min(1).max(200),
  unitPrice: z.number().nonnegative(),
  category: z.string().max(100).default(''),
  description: z.string().max(2000).default(''),
  stockCount: z.number().int().nonnegative().default(0),
  taxType: z.enum(['none', 'standard', 'reduced']).default('none'),
  unit: z.string().max(20).default(''),
  manufacturer: z.string().max(200).default(''),
  subscriptionPeriod: z.string().max(50).nullable().default(null),
  subscriptionPriceUnit: z.string().max(50).nullable().default(null),
  customFields: z
    .record(
      z.string().regex(SAFE_KEY_RE),
      z.union([z.string(), z.number(), z.boolean(), z.null()]),
    )
    .default({}),
  priceHistory: z.array(PriceHistoryEntrySchema).max(365).default([]),
  deletedAt: z.string().nullable().default(null),
  createdAt: z.string(),
  updatedAt: z.string(),
  version: z.number().int().nonnegative().default(0),
})

export const ProductListSchema = z.array(ProductSchema)

export const ProductCustomFieldDefsSchema = z.array(ProductCustomFieldDefSchema)

// ---------------------------------------------------------------------------
// Re-export inferred types for convenience (match src/types)
// ---------------------------------------------------------------------------

export type { Product, ProductCustomFieldDef, ProductMasterDefinition }
