/**
 * Auth API — session login/logout/profile and Personal Access Tokens.
 */
import { z } from 'zod'
import { apiFetch } from './client'
import { jsonBody } from './apiHelpers'

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/**
 * Sign-in methods the server offers (#499). Present on every `/auth/me` response,
 * including the anonymous one, so the login modal can render before login.
 */
const AuthOptionsSchema = z.object({
  /** Server `AUTH_MODE`: `local` | `oidc` | `both` (informational; the flags below drive the UI). */
  mode: z.enum(['local', 'oidc', 'both']).optional(),
  localLoginEnabled: z.boolean(),
  oidcEnabled: z.boolean(),
  /** Path to navigate the browser to (not fetch) to start a Keycloak login. */
  oidcLoginUrl: z.string().optional(),
})
export type AuthOptions = z.infer<typeof AuthOptionsSchema>

const MeSchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  roles: z.array(z.string()),
  anonymous: z.boolean(),
  /** How this session authenticated: `local` | `oidc` | `none` (#499). Absent on older servers. */
  provider: z.string().optional(),
  /** False for OIDC-provisioned accounts — password change is not offered (#499). */
  hasPassword: z.boolean().optional(),
  auth: AuthOptionsSchema.optional(),
})

export type Me = z.infer<typeof MeSchema>

export async function getMe(): Promise<Me> {
  return apiFetch('/api/v1/auth/me', MeSchema)
}

/** Fixed: was sending `email` — backend expects `userId` */
export async function login(userId: string, password: string): Promise<Me> {
  return apiFetch('/api/v1/auth/login', MeSchema, jsonBody({ userId, password }))
}

const LogoutSchema = z.object({
  status: z.string().optional(),
  /** Keycloak RP-Initiated Logout URL — navigate there to end the SSO session too (#499). */
  logoutUrl: z.string().optional(),
}).optional()
export type LogoutResult = z.infer<typeof LogoutSchema>

export async function logout(): Promise<LogoutResult> {
  return apiFetch('/api/v1/auth/logout', LogoutSchema, { method: 'POST' })
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
