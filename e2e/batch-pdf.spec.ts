import { test, expect } from '@playwright/test'
import { startBlankEditor, saveAsNewTemplate, uniqueName } from './helpers'

/**
 * Async PDF jobs + unified job history (#261).
 *
 * The full CSV → batch-ZIP UI flow needs stored responses / DB-row fixtures,
 * so this spec covers the stable core instead: an async PDF job is submitted
 * against a template saved through the UI (POST /api/v2/pdf-jobs — the same
 * unified pipeline the batch endpoints feed, #191), then the ジョブ tab is
 * asserted to list it, auto-refresh it to a terminal state, and remove it via
 * the row action (キャンセル while running / 削除 once terminal — same button).
 */

test('async PDF job appears in the ジョブ tab and can be removed', async ({ page }) => {
  await startBlankEditor(page)

  // 1. Persist a template through the UI so the job has something to render.
  const name = uniqueName('E2E-job')
  await saveAsNewTemplate(page, name)

  // 2. Resolve its id and submit an async PDF job via the session-cookie API.
  //    (State-changing requests need an allowed Origin — CSRF before-filter.)
  const list = await page.request.get('/api/v2/templates')
  expect(list.status()).toBe(200)
  const { items } = (await list.json()) as { items: Array<{ id: string; name: string }> }
  const template = items.find((t) => t.name === name)
  expect(template).toBeTruthy()

  const jobsBefore = (await (await page.request.get('/api/v2/pdf-jobs')).json()) as unknown[]

  const submit = await page.request.post('/api/v2/pdf-jobs', {
    headers: { Origin: 'http://localhost:5173' },
    data: { templateId: template!.id },
  })
  expect(submit.ok()).toBe(true)
  const { jobId } = (await submit.json()) as { jobId: string }
  expect(jobId).toBeTruthy()

  // 3. The ジョブ tab lists it (single-PDF jobs show as 単票PDF).
  await page.getByRole('tab', { name: 'ジョブ', exact: true }).click()
  await expect(page.getByText(`ジョブ履歴 (${jobsBefore.length + 1})`)).toBeVisible({
    timeout: 15_000,
  })
  await expect(page.getByRole('cell', { name: '単票PDF' }).first()).toBeVisible()

  // 4. Wait for a terminal state (the panel auto-refreshes every 3s while any
  //    job is running), then remove the newest row from the history.
  const firstRow = page.locator('tbody tr').first()
  await expect(firstRow.getByRole('button', { name: '削除' })).toBeVisible({ timeout: 30_000 })
  await firstRow.getByRole('button', { name: '削除' }).click()
  await expect(page.getByText(`ジョブ履歴 (${jobsBefore.length})`)).toBeVisible({
    timeout: 15_000,
  })

  // Cleanup: delete the throwaway template.
  const del = await page.request.delete(`/api/v2/templates/${template!.id}`, {
    headers: { Origin: 'http://localhost:5173' },
  })
  expect(del.ok()).toBe(true)
})
