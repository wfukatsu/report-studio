import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useReportStore } from '@/store'
import { loadFromBackend, evaluateCalculations, evaluateValidate, listVersions, createVersion, restoreVersion, listReports, getReport, createReport, saveReport, deleteReport, getMe, login, logout, checkHealth, exportTemplate, importTemplate } from './reportApi'
import type { ReportDefinition } from '@/types'

// Minimal valid ReportDefinition payload
function makeDefinition(id: string) {
  return {
    id,
    metadata: { documentName: `Report ${id}`, version: '1.0', reportType: 'general' },
    pageSettings: {
      paperSize: 'A4' as const,
      orientation: 'portrait' as const,
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm' as const,
    },
    defaultTextStyle: {},
    templateVariables: [],
    calculationRules: [],
    dataSources: [],
    outputVariants: [],
    submissionModels: [],
    validationRules: [],
    pages: [{
      id: `page-${id}`,
      name: 'Page 1',
      width: 210,
      height: 297,
      background: '#ffffff',
      sections: [{ id: `sec-${id}`, sectionType: 'body' as const, height: 297, elements: [] }],
    }],
  }
}

beforeEach(() => {
  vi.unstubAllGlobals()
  useReportStore.getState().newReport()
})

describe('loadFromBackend — concurrent load race condition', () => {
  it('uses generation counter to prevent older load from overwriting newer result', async () => {
    let resolveA!: (v: unknown) => void
    let resolveB!: (v: unknown) => void

    const defA = makeDefinition('template-A')
    const defB = makeDefinition('template-B')

    const fetchMock = vi.fn()
      .mockReturnValueOnce(
        new Promise((res) => { resolveA = res }).then(() => ({
          ok: true, status: 200,
          json: () => Promise.resolve(defA),
        })),
      )
      .mockReturnValueOnce(
        new Promise((res) => { resolveB = res }).then(() => ({
          ok: true, status: 200,
          json: () => Promise.resolve(defB),
        })),
      )

    vi.stubGlobal('fetch', fetchMock)

    // Start load A first, then load B before A completes
    const promiseA = loadFromBackend('template-A')
    const promiseB = loadFromBackend('template-B')

    // Resolve B first (faster), then A (slower — should be discarded)
    resolveB(undefined)
    await promiseB

    resolveA(undefined)
    await promiseA

    // Only B's result should be in the store
    expect(useReportStore.getState().definition.id).toBe('template-B')
    expect(useReportStore.getState().currentTemplateId).toBe('template-B')
  })

  it('sets loadState to error when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))

    await loadFromBackend('template-X')

    expect(useReportStore.getState().loadState).toBe('error')
    expect(useReportStore.getState().backendConnected).toBe(false)
  })

  it('invalidates computed state after successful load', async () => {
    // Pre-populate computed state
    useReportStore.getState().setComputedResults({
      results: { total: 999 },
      errors: {},
    })
    expect(useReportStore.getState().computedValues).toEqual({ total: 999 })

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeDefinition('template-C')),
    }))

    await loadFromBackend('template-C')

    expect(useReportStore.getState().computedValues).toEqual({})
  })

  it('increments loadGeneration on each call', async () => {
    const initialGeneration = useReportStore.getState().loadGeneration
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeDefinition('t1')),
    }))

    loadFromBackend('t1')
    expect(useReportStore.getState().loadGeneration).toBe(initialGeneration + 1)

    loadFromBackend('t2')
    expect(useReportStore.getState().loadGeneration).toBe(initialGeneration + 2)
  })
})

describe('evaluateCalculations', () => {
  const mockDefinition = makeDefinition('tpl-1')
  const mockTestData = { qty: 3, unitPrice: 100 }

  it('sends POST to /evaluate with definition and testData', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: { total: 300 }, errors: {} }),
    }))

    const result = await evaluateCalculations('tpl-1', mockDefinition, mockTestData)

    expect(result).toEqual({ results: { total: 300 }, errors: {} })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/tpl-1/evaluate')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.testData).toEqual(mockTestData)
  })

  it('forwards AbortSignal to fetch', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ results: {}, errors: {} }),
    }))

    await evaluateCalculations('tpl-1', mockDefinition, mockTestData, controller.signal)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).signal).toBe(controller.signal)
  })
})

describe('evaluateValidate', () => {
  const mockDefinition = makeDefinition('tpl-2')
  const mockTestData = {}

  it('sends POST to /validate and returns violations', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({
        violations: [{ ruleKey: 'required-check', message: '必須項目です' }],
      }),
    }))

    const result = await evaluateValidate('tpl-2', mockDefinition, mockTestData)

    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].ruleKey).toBe('required-check')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/tpl-2/validate')
  })

  it('forwards AbortSignal to fetch', async () => {
    const controller = new AbortController()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ violations: [] }),
    }))

    await evaluateValidate('tpl-2', mockDefinition, mockTestData, controller.signal)

    const [, init] = vi.mocked(fetch).mock.calls[0]
    expect((init as RequestInit).signal).toBe(controller.signal)
  })

  it('encodes templateId in URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ violations: [] }),
    }))

    await evaluateValidate('template/with spaces', mockDefinition, mockTestData)

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/template%2Fwith%20spaces/validate')
  })
})

describe('listVersions', () => {
  it('returns array of version items sorted as returned by backend', async () => {
    const items = [
      { id: 'v1', versionNumber: 1, createdAt: '2026-01-01T00:00:00Z' },
      { id: 'v2', versionNumber: 2, createdAt: '2026-01-02T00:00:00Z' },
    ]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(items),
    }))

    const result = await listVersions('tpl-1')

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('v1')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/tpl-1/versions')
  })

  it('encodes templateId in URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve([]),
    }))

    await listVersions('tpl/special')

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/tpl%2Fspecial/versions')
  })
})

describe('createVersion', () => {
  it('sends POST and returns new version item', async () => {
    const newVersion = { id: 'v3', versionNumber: 3, createdAt: '2026-01-03T00:00:00Z' }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(newVersion),
    }))

    const result = await createVersion('tpl-1')

    expect(result.id).toBe('v3')
    expect(result.versionNumber).toBe(3)
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/tpl-1/versions')
    expect((init as RequestInit).method).toBe('POST')
  })
})

describe('restoreVersion — history reset', () => {
  it('resets undo/redo history after restoring a version', async () => {
    // Load an initial report to establish baseline state
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeDefinition('tpl-base')),
    }))
    await loadFromBackend('tpl-base')

    // Push some history entries directly
    useReportStore.getState().pushHistory()
    useReportStore.getState().pushHistory()

    const historyBeforeRestore = useReportStore.getState().history.length
    expect(historyBeforeRestore).toBeGreaterThan(1)

    // Restore a version — this calls loadFromBackend which calls loadReport,
    // resetting history to a single entry
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeDefinition('tpl-restored')),
    }))
    await restoreVersion('tpl-restored', 'v-some')

    const state = useReportStore.getState()
    expect(state.history).toHaveLength(1)
    expect(state.historyIndex).toBe(0)
    expect(state.definition.id).toBe('tpl-restored')
  })
})

// ---------------------------------------------------------------------------
// Template CRUD
// ---------------------------------------------------------------------------

describe('listReports', () => {
  it('returns template list items', async () => {
    const items = [{ id: 'tpl-1', name: 'Template 1' }]
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ items, total: 1 }),
    }))

    const result = await listReports()
    expect(result.items).toHaveLength(1)
    expect(result.items[0].id).toBe('tpl-1')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates')
  })
})

describe('getReport', () => {
  it('fetches and returns report definition', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(makeDefinition('report-123')),
    }))

    const result = await getReport('report-123')
    expect(result.id).toBe('report-123')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/report-123')
  })
})

describe('createReport', () => {
  it('sends POST to /templates with name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: 'new-tpl', name: '新しいテンプレート' }),
    }))

    const result = await createReport('新しいテンプレート')
    expect(result.id).toBe('new-tpl')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates')
    expect((init as RequestInit).method).toBe('POST')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.name).toBe('新しいテンプレート')
  })
})

describe('saveReport', () => {
  it('sends PUT to /templates/:id with definition', async () => {
    const def = makeDefinition('save-tpl')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(def),
    }))

    const result = await saveReport('save-tpl', def as ReportDefinition)
    expect(result.id).toBe('save-tpl')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/save-tpl')
    expect((init as RequestInit).method).toBe('PUT')
  })
})

describe('deleteReport', () => {
  it('sends DELETE to /templates/:id', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 204,
      json: () => Promise.resolve(undefined),
    }))

    await deleteReport('del-tpl')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/del-tpl')
    expect((init as RequestInit).method).toBe('DELETE')
  })
})

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe('getMe', () => {
  it('returns current user', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: 'user-1', email: 'test@example.com' }),
    }))

    const result = await getMe()
    expect(result.id).toBe('user-1')
    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v1/auth/me')
  })
})

describe('login', () => {
  it('sends POST with email and password', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve({ id: 'user-1', email: 'user@test.com' }),
    }))

    const result = await login('user@test.com', 'password123')
    expect(result.email).toBe('user@test.com')
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v1/auth/login')
    const body = JSON.parse((init as RequestInit).body as string)
    expect(body.email).toBe('user@test.com')
    expect(body.password).toBe('password123')
  })
})

describe('logout', () => {
  it('sends POST to /logout', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 204,
      json: () => Promise.resolve(undefined),
    }))

    await logout()
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v1/auth/logout')
    expect((init as RequestInit).method).toBe('POST')
  })
})

describe('checkHealth', () => {
  it('returns true when backend is healthy', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: () => Promise.resolve(undefined),
    }))

    const result = await checkHealth()
    expect(result).toBe(true)
  })

  it('returns false when fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Network error')))

    const result = await checkHealth()
    expect(result).toBe(false)
  })
})

describe('exportTemplate', () => {
  it('sends GET to /export and returns blob with filename', async () => {
    const mockBlob = new Blob(['{}'], { type: 'application/json' })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: {
        // Fetch Headers.get() is case-insensitive; match any case
        get: (_name: string) => 'attachment; filename="my-template.rds2.json"',
      },
      blob: () => Promise.resolve(mockBlob),
    }))

    const result = await exportTemplate('tpl-1')

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/tpl-1/export')
    expect(result.blob).toBe(mockBlob)
    expect(result.filename).toBe('my-template.rds2.json')
  })

  it('encodes templateId in URL', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true, status: 200,
      headers: { get: () => null },
      blob: () => Promise.resolve(new Blob()),
    }))

    await exportTemplate('tpl/with spaces')

    const [url] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/tpl%2Fwith%20spaces/export')
  })
})

describe('importTemplate', () => {
  it('sends POST to /import with raw JSON body', async () => {
    const fileContent = JSON.stringify({ formatVersion: 2, definition: { id: 'orig' } })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 'new-id', name: 'テンプレートA (インポート)' }),
    }))

    const result = await importTemplate(fileContent)

    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/v2/templates/import')
    expect((init as RequestInit).method).toBe('POST')
    expect((init as RequestInit).body).toBe(fileContent)
    expect(result.id).toBe('new-id')
    expect(result.name).toBe('テンプレートA (インポート)')
  })

  it('throws when server returns error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: () => Promise.resolve({ error: 'Unsupported format version: 99' }),
    }))

    await expect(importTemplate('bad json')).rejects.toThrow()
  })
})
