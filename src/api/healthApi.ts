/**
 * Health check API.
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------

export async function checkHealth(): Promise<boolean> {
  try {
    await apiFetch('/api/v2/health', z.undefined())
    return true
  } catch {
    return false
  }
}
