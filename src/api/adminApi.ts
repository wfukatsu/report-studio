/**
 * Admin API — user management, server config, and server restart.
 */
import { z } from 'zod'
import { apiFetch } from './client'
import { jsonBody } from './apiHelpers'

// ---------------------------------------------------------------------------
// Admin user management
// ---------------------------------------------------------------------------

export const UserRoleSchema = z.enum(['user', 'admin'])
export type UserRole = z.infer<typeof UserRoleSchema>

const UserSummarySchema = z.object({
  userId: z.string(),
  displayName: z.string(),
  roles: z.array(UserRoleSchema.catch('user' as UserRole)),
})
export type UserSummary = z.infer<typeof UserSummarySchema>

const UserListSchema = z.object({ users: z.array(UserSummarySchema) })

export async function listUsers(signal?: AbortSignal): Promise<UserSummary[]> {
  const res = await apiFetch('/api/v1/admin/users', UserListSchema, { signal })
  return res.users
}

export async function createUser(user: {
  userId: string
  displayName?: string
  password: string
  roles?: UserRole[]
}, signal?: AbortSignal): Promise<UserSummary> {
  return apiFetch('/api/v1/admin/users', UserSummarySchema, { ...jsonBody(user), signal })
}

export async function deleteUser(userId: string): Promise<void> {
  return apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}`, z.undefined(), {
    method: 'DELETE',
  })
}

// ---------------------------------------------------------------------------
// Admin server config
// ---------------------------------------------------------------------------

const ServerConfigSchema = z.record(z.string(), z.string())
export type ServerConfig = z.infer<typeof ServerConfigSchema>

export async function getServerConfig(): Promise<ServerConfig> {
  return apiFetch('/api/v1/admin/server-config', ServerConfigSchema)
}

export async function putServerConfig(config: ServerConfig): Promise<{ message: string }> {
  return apiFetch('/api/v1/admin/server-config', z.object({ message: z.string() }), jsonBody(config))
}

export async function testServerConfig(config: ServerConfig): Promise<{ success: boolean; message: string }> {
  return apiFetch(
    '/api/v1/admin/server-config/test',
    z.object({ success: z.boolean(), message: z.string() }),
    jsonBody(config),
  )
}

export async function restartServer(): Promise<{ message: string }> {
  return apiFetch('/api/v1/admin/server/restart', z.object({ message: z.string() }), {
    method: 'POST',
  })
}
