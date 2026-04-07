import { describe, it, expect, vi, beforeEach } from 'vitest'
import { exportToJSON, isSafeImageSrc, exportPageToPng, exportReportToPdf } from './exportUtils'
import { importFromJSON } from './migration'
import type { ReportDefinition } from '@/types'

// Minimal valid ReportDefinition for round-trip tests
function makeDefinition(overrides?: Partial<ReportDefinition>): ReportDefinition {
  return {
    id: 'test-id',
    metadata: {
      documentName: 'Test Report',
      version: '1.0',
      reportType: 'general',
    },
    pageSettings: {
      paperSize: 'A4',
      orientation: 'portrait',
      margins: { top: 20, right: 20, bottom: 20, left: 20 },
      unit: 'mm',
    },
    defaultTextStyle: {},
    templateVariables: [],
    calculationRules: [],
    dataSources: [],
    outputVariants: [],
    submissionModels: [],
    validationRules: [],
    pages: [
      {
        id: 'page-1',
        name: 'Page 1',
        width: 210,
        height: 297,
        background: '#ffffff',
        sections: [
          { id: 'sec-1', sectionType: 'body', height: 297, elements: [] },
        ],
      },
    ],
    ...overrides,
  }
}

describe('exportToJSON', () => {
  it('includes $schema marker', () => {
    const definition = makeDefinition()
    const json = exportToJSON(definition)
    const parsed = JSON.parse(json)
    expect(parsed.$schema).toBe('report-definition/v1')
  })

  it('includes exportedAt timestamp', () => {
    const definition = makeDefinition()
    const json = exportToJSON(definition)
    const parsed = JSON.parse(json)
    expect(typeof parsed.exportedAt).toBe('string')
    expect(new Date(parsed.exportedAt).getTime()).toBeGreaterThan(0)
  })

  it('preserves all definition fields', () => {
    const definition = makeDefinition({ id: 'my-report' })
    const json = exportToJSON(definition)
    const parsed = JSON.parse(json)
    expect(parsed.id).toBe('my-report')
    expect(parsed.metadata.documentName).toBe('Test Report')
    expect(parsed.pages).toHaveLength(1)
  })
})

describe('exportToJSON → importFromJSON round-trip', () => {
  it('round-trips a ReportDefinition correctly', () => {
    const definition = makeDefinition()
    const json = exportToJSON(definition)
    const result = importFromJSON(json)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.definition.id).toBe(definition.id)
    expect(result.definition.metadata.documentName).toBe(definition.metadata.documentName)
    expect(result.definition.pages).toHaveLength(1)
  })

  it('returns error for unknown $schema version', () => {
    const json = JSON.stringify({ $schema: 'report-definition/v99', id: 'x', pages: [] })
    const result = importFromJSON(json)
    expect(result.ok).toBe(false)
  })
})

describe('importFromJSON structural validation', () => {
  it('returns error for empty object', () => {
    const result = importFromJSON('{}')
    expect(result.ok).toBe(false)
  })

  it('returns error when metadata is missing', () => {
    const json = JSON.stringify({
      $schema: 'report-definition/v1',
      id: 'test',
      pages: [],
      pageSettings: {},
      templateVariables: [],
      calculationRules: [],
      dataSources: [],
    })
    const result = importFromJSON(json)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('必須フィールドが不正または不足しています')
    }
  })

  it('returns error when pageSettings is missing', () => {
    const json = JSON.stringify({
      $schema: 'report-definition/v1',
      id: 'test',
      pages: [],
      metadata: { documentName: 'x', version: '1.0', reportType: 'general' },
      templateVariables: [],
      calculationRules: [],
      dataSources: [],
    })
    const result = importFromJSON(json)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('必須フィールドが不正または不足しています')
    }
  })

  it('returns error when templateVariables is not an array', () => {
    const json = JSON.stringify({
      $schema: 'report-definition/v1',
      id: 'test',
      pages: [],
      metadata: { documentName: 'x', version: '1.0', reportType: 'general' },
      pageSettings: { paperSize: 'A4' },
      templateVariables: 'not-array',
      calculationRules: [],
      dataSources: [],
    })
    const result = importFromJSON(json)
    expect(result.ok).toBe(false)
  })
})

describe('importFromJSON with legacy Report format', () => {
  it('auto-migrates old Report without $schema', () => {
    const legacy = {
      id: 'old-id',
      name: 'Old Report',
      settings: { paperSize: 'A4', orientation: 'portrait' },
      pages: [{ id: 'p1', name: 'P1', width: 210, height: 297, background: '#fff', elements: [] }],
      dataSource: null,
    }
    const result = importFromJSON(JSON.stringify(legacy))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.definition.metadata.documentName).toBe('Old Report')
    expect(result.definition.pages).toHaveLength(1)
  })

  it('returns error for invalid JSON', () => {
    const result = importFromJSON('{invalid json}')
    expect(result.ok).toBe(false)
    expect(result.ok === false && result.error).toBeTruthy()
  })

  it('returns error for JSON missing required fields', () => {
    const result = importFromJSON(JSON.stringify({ foo: 'bar' }))
    expect(result.ok).toBe(false)
  })
})

describe('isSafeImageSrc', () => {
  it('allows https:// URLs', () => {
    expect(isSafeImageSrc('https://example.com/img.png')).toBe(true)
  })
  it('rejects http:// URLs (mixed-content risk)', () => {
    expect(isSafeImageSrc('http://example.com/img.png')).toBe(false)
  })
  it('allows data:image/png URLs', () => {
    expect(isSafeImageSrc('data:image/png;base64,abc')).toBe(true)
  })
  it('allows data:image/jpeg URLs', () => {
    expect(isSafeImageSrc('data:image/jpeg;base64,abc')).toBe(true)
  })
  it('allows data:image/gif URLs', () => {
    expect(isSafeImageSrc('data:image/gif;base64,abc')).toBe(true)
  })
  it('allows data:image/webp URLs', () => {
    expect(isSafeImageSrc('data:image/webp;base64,abc')).toBe(true)
  })
  it('rejects data:image/svg+xml (XSS via <script>)', () => {
    expect(isSafeImageSrc('data:image/svg+xml;base64,abc')).toBe(false)
  })
  it('rejects javascript: URLs', () => {
    expect(isSafeImageSrc('javascript:alert(1)')).toBe(false)
  })
  it('rejects empty string (prevents self-requests)', () => {
    expect(isSafeImageSrc('')).toBe(false)
  })
  it('rejects data: URIs larger than 2MB', () => {
    const large = 'data:image/png;base64,' + 'A'.repeat(2 * 1024 * 1024 + 1)
    expect(isSafeImageSrc(large)).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// exportPageToPng
// ---------------------------------------------------------------------------

vi.mock('html2canvas', () => ({
  default: vi.fn(),
}))

// jsPDF is default-exported as a constructor
const mockSave = vi.fn()
const mockAddImage = vi.fn()
const mockAddPage = vi.fn()

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    save: mockSave,
    addImage: mockAddImage,
    addPage: mockAddPage,
  })),
}))

import html2canvas from 'html2canvas'

const mockHtml2canvas = vi.mocked(html2canvas)

function makeCanvasMock(width = 210, height = 297) {
  return {
    width,
    height,
    toDataURL: vi.fn().mockReturnValue('data:image/png;base64,abc'),
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // Re-apply default mock implementations after clearAllMocks
  mockSave.mockReset()
  mockAddImage.mockReset()
  mockAddPage.mockReset()
})

describe('exportPageToPng', () => {
  it('calls html2canvas with the provided element', async () => {
    const canvasMock = makeCanvasMock()
    mockHtml2canvas.mockResolvedValue(canvasMock as unknown as HTMLCanvasElement)

    const el = document.createElement('div')
    // PNG export creates an anchor and calls click() — just verify it doesn't throw
    await exportPageToPng(el, 'test.png')

    expect(mockHtml2canvas).toHaveBeenCalledWith(el, expect.objectContaining({ useCORS: true }))
  })

  it('throws error when html2canvas fails', async () => {
    mockHtml2canvas.mockRejectedValue(new Error('canvas error'))

    const el = document.createElement('div')
    await expect(exportPageToPng(el)).rejects.toThrow('PNG export failed: canvas error')
  })
})

describe('exportReportToPdf', () => {
  it('does nothing when no elements provided', async () => {
    await exportReportToPdf([])
    expect(mockHtml2canvas).not.toHaveBeenCalled()
  })

  it('creates PDF for single page', async () => {
    const canvasMock = makeCanvasMock(595, 842)
    mockHtml2canvas.mockResolvedValue(canvasMock as unknown as HTMLCanvasElement)

    const el = document.createElement('div')
    await exportReportToPdf([el], 'report.pdf')

    expect(mockHtml2canvas).toHaveBeenCalledTimes(1)
    expect(mockAddImage).toHaveBeenCalledTimes(1)
    expect(mockSave).toHaveBeenCalledWith('report.pdf')
    expect(mockAddPage).not.toHaveBeenCalled()
  })

  it('adds pages for multi-page export', async () => {
    const canvasMock = makeCanvasMock(595, 842)
    mockHtml2canvas.mockResolvedValue(canvasMock as unknown as HTMLCanvasElement)

    const el1 = document.createElement('div')
    const el2 = document.createElement('div')
    const el3 = document.createElement('div')
    await exportReportToPdf([el1, el2, el3], 'multi.pdf')

    expect(mockHtml2canvas).toHaveBeenCalledTimes(3)
    expect(mockAddPage).toHaveBeenCalledTimes(2) // page 2 and 3
    expect(mockAddImage).toHaveBeenCalledTimes(3)
    expect(mockSave).toHaveBeenCalledWith('multi.pdf')
  })

  it('throws error when html2canvas fails', async () => {
    mockHtml2canvas.mockRejectedValue(new Error('html2canvas failure'))

    const el = document.createElement('div')
    await expect(exportReportToPdf([el])).rejects.toThrow('PDF export failed: html2canvas failure')
  })
})
