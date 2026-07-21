/**
 * Auth API — session login/logout/profile and Personal Access Tokens.
 */
import { z } from 'zod'
import { apiFetch } from './client'
import { jsonBody } from './apiHelpers'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const MeSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
  anonymous: z.boolean(),
})

export type Me = z.infer<typeof MeSchema>

export async function getMe(): Promise<Me> {
  return apiFetch('/api/v1/auth/me', MeSchema)
}

/** Fixed: was sending `email` — backend expects `userId` */
export async function login(userId: string, password: string): Promise<Me> {
  return apiFetch('/api/v1/auth/login', MeSchema, jsonBody({ userId, password }))
}

export async function logout(): Promise<void> {
  return apiFetch('/api/v1/auth/logout', z.undefined(), { method: 'POST' })
}

export async function changeProfile(patch: {
  displayName?: string
  currentPassword?: string
  newPassword?: string
}): Promise<Me> {
  return apiFetch('/api/v1/auth/change-profile', MeSchema, jsonBody(patch))
}

// ---------------------------------------------------------------------------
// Personal Access Tokens (issue #195)
// ---------------------------------------------------------------------------

export interface ApiTokenSummary {
  id: string
  label: string
  preview: string
  createdAt: number
  lastUsedAt: number
}

/** Create a PAT. The plaintext `token` is returned exactly once. */
export async function createApiToken(label: string): Promise<ApiTokenSummary & { token: string }> {
  const res = await fetch('/api/v1/auth/tokens', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ label }),
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to create token: ${res.status}`)
  return res.json()
}

export async function listApiTokens(): Promise<ApiTokenSummary[]> {
  const res = await fetch('/api/v1/auth/tokens', { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to list tokens: ${res.status}`)
  const body = (await res.json()) as { tokens?: ApiTokenSummary[] }
  return body.tokens ?? []
}

export async function revokeApiToken(id: string): Promise<void> {
  const res = await fetch(`/api/v1/auth/tokens/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to revoke token: ${res.status}`)
}
