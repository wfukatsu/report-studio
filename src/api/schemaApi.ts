/**
 * Schema API — schema inference and unified schema CRUD (/api/v2/schemas),
 * plus legacy schema-library aliases.
 */
import { z } from 'zod'
import { apiFetch } from './client'
import { jsonBody } from './apiHelpers'
import type { SchemaDefinition } from '@/types'

// ---------------------------------------------------------------------------
// Schema inference
// ---------------------------------------------------------------------------

const SchemaDefinitionResponseSchema = z.object({
  groups: z.array(z.object({
    id: z.string(),
    label: z.string(),
    role: z.enum(['master', 'detail']),
    dataKey: z.string(),
    fields: z.array(z.object({
      id: z.string(),
      key: z.string(),
      label: z.string(),
      type: z.string(),
    })),
  })),
})

/**
 * Ask the backend to infer a SchemaDefinition from a JSON sample.
 * Useful for auto-generating schema from existing data.
 */
export async function inferSchema(sample: Record<string, unknown>): Promise<SchemaDefinition> {
  const result = await apiFetch('/api/v2/schemas/infer', SchemaDefinitionResponseSchema, jsonBody({ sample }))
  return result as unknown as SchemaDefinition
}

// ---------------------------------------------------------------------------
// Schema API — unified schema CRUD (/api/v2/schemas)
// ---------------------------------------------------------------------------

export interface SchemaListItem {
  id: string
  name: string
  visibility: 'private' | 'shared'
  createdBy: string
  createdAt: string
  updatedAt: string
}

const SchemaListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  visibility: z.enum(['private', 'shared']),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

const SchemaListSchema = z.object({
  items: z.array(SchemaListItemSchema),
  total: z.number(),
})

// Full envelope returned by GET /api/v2/schemas/{id}
export interface SchemaEnvelope {
  id: string
  name: string
  visibility: 'private' | 'shared'
  createdBy: string
  createdAt: number
  updatedAt: number
  definition: SchemaDefinitionPayload
}

export interface SchemaDefinitionPayload {
  schema?: unknown
  dataSources?: unknown
  groups?: unknown
  [key: string]: unknown
}

/**
 * Accepted definition input for create/update. `SchemaDefinition` is included
 * explicitly because interfaces have no implicit index signature and would
 * otherwise force callers to spread into a fresh object literal.
 */
export type SchemaDefinitionInput = SchemaDefinition | SchemaDefinitionPayload

const SchemaEnvelopeSchema = z.object({
  id: z.string(),
  name: z.string(),
  visibility: z.enum(['private', 'shared']),
  createdBy: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  definition: z.object({}).passthrough(),
})

const SchemaCreateResponseSchema = z.object({
  id: z.string(),
  name: z.string(),
  updatedAt: z.number(),
})

const SchemaUpdateResponseSchema = z.object({
  status: z.string(),
  id: z.string(),
  updatedAt: z.number(),
})

// Backward-compat re-exports
export type SchemaLibraryItem = SchemaListItem
export type SchemaLibraryDefinition = SchemaDefinitionPayload

export async function listSchemas(): Promise<{ items: SchemaListItem[]; total: number }> {
  return apiFetch('/api/v2/schemas', SchemaListSchema)
}

export async function getSchema(id: string): Promise<SchemaEnvelope> {
  return apiFetch(`/api/v2/schemas/${encodeURIComponent(id)}`, SchemaEnvelopeSchema)
}

export async function createSchema(
  name: string,
  definition: SchemaDefinitionInput,
  visibility: 'private' | 'shared' = 'private',
): Promise<{ id: string; name: string; updatedAt: number }> {
  return apiFetch('/api/v2/schemas', SchemaCreateResponseSchema, jsonBody({
    name,
    visibility,
    definition,
  }))
}

export async function updateSchema(
  id: string,
  params: {
    name: string
    visibility: 'private' | 'shared'
    definition: SchemaDefinitionInput
    updatedAt?: number | null
  },
): Promise<{ status: string; id: string; updatedAt: number }> {
  return apiFetch(`/api/v2/schemas/${encodeURIComponent(id)}`, SchemaUpdateResponseSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export async function deleteSchema(id: string): Promise<void> {
  return apiFetch(`/api/v2/schemas/${encodeURIComponent(id)}`, z.undefined(), { method: 'DELETE' })
}

// Legacy aliases for backward compatibility
export const listSchemaLibrary = listSchemas
export const getSchemaLibraryItem = (id: string) => getSchema(id).then(e => e.definition as SchemaDefinitionPayload)
export const saveToSchemaLibrary = (name: string, definition: SchemaDefinitionPayload, visibility: 'private' | 'shared' = 'private') =>
  createSchema(name, definition, visibility)
export const updateSchemaLibrary = (id: string, name: string, definition: SchemaDefinitionPayload, visibility: 'private' | 'shared') =>
  updateSchema(id, { name, visibility, definition }).then(() => undefined)
export const deleteSchemaLibraryItem = deleteSchema
