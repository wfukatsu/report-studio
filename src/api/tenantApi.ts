/**
 * Tenant API — tenant metadata (company name, address, phone, logo).
 */
import { z } from 'zod'
import { apiFetch } from './client'
import type { TenantInfo } from '@/types'

// ---------------------------------------------------------------------------
// Tenant info
// ---------------------------------------------------------------------------

const TenantInfoSchema = z.object({
  companyName: z.string().optional(),
  postalCode: z.string().optional(),
  address: z.string().optional(),
  address1: z.string().optional(),
  address2: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  representativeName: z.string().optional(),
  logoBase64: z.string().optional(),
  custom: z.record(z.string(), z.string()).optional(),
})

/** GET /api/v2/tenant — returns {} when not yet configured */
export async function getTenantInfo(): Promise<TenantInfo> {
  return apiFetch('/api/v2/tenant', TenantInfoSchema) as Promise<TenantInfo>
}

/** PUT /api/v2/tenant — replaces entire tenant info document */
export async function putTenantInfo(info: TenantInfo): Promise<TenantInfo> {
  return apiFetch('/api/v2/tenant', TenantInfoSchema, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(info),
  }) as Promise<TenantInfo>
}
