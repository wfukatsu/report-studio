/**
 * Sequence API — per-template document auto-numbering (シーケンス採番) config.
 */

// ---------------------------------------------------------------------------
// Document Auto-numbering (シーケンス採番)
// ---------------------------------------------------------------------------

export interface SequenceConfig {
  configured?: boolean
  prefix?: string
  suffix?: string
  digits?: number
  resetOn?: 'year' | null
  counter?: number
}

export async function getSequenceConfig(templateId: string): Promise<SequenceConfig> {
  const res = await fetch(`/api/v1/sequences/${encodeURIComponent(templateId)}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to get sequence config: ${res.status}`)
  return res.json()
}

export async function updateSequenceConfig(templateId: string, config: Partial<SequenceConfig>): Promise<SequenceConfig> {
  const res = await fetch(`/api/v1/sequences/${encodeURIComponent(templateId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    credentials: 'include',
  })
  if (!res.ok) throw new Error(`Failed to update sequence config: ${res.status}`)
  return res.json()
}
