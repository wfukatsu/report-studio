/**
 * Webhook API — per-template webhook configuration and test delivery.
 */

// ---------------------------------------------------------------------------
// Webhook Configuration
// ---------------------------------------------------------------------------

export interface WebhookConfig {
  configured?: boolean
  url?: string
  secret?: string
}

export async function getWebhookConfig(templateId: string): Promise<WebhookConfig> {
  const res = await fetch(`/api/v1/webhooks/${encodeURIComponent(templateId)}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`Failed to get webhook config: ${res.status}`)
  return res.json()
}

export async function updateWebhookConfig(templateId: string, config: WebhookConfig): Promise<WebhookConfig> {
  const res = await fetch(`/api/v1/webhooks/${encodeURIComponent(templateId)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Failed: ${res.status}`)
  }
  return res.json()
}

export async function testWebhook(templateId: string): Promise<{ delivered: boolean; url: string }> {
  const res = await fetch(`/api/v1/webhooks/${encodeURIComponent(templateId)}/test`, {
    method: 'POST',
    credentials: 'include',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error ?? `Test failed: ${res.status}`)
  }
  return res.json()
}
