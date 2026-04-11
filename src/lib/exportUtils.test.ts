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
    // btoa('<svg><script>alert(1)</script></svg>')
    const xssSvg = 'data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+'
    expect(isSafeImageSrc(xssSvg)).toBe(false)
  })
  it('rejects SVG with <use href> to external resource', () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><use href="//attacker.com/evil.svg#x"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(false)
  })
  it('rejects SVG with <image href> to external resource', () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.com/track.png"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(false)
  })
  it('rejects SVG with xlink:href', () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><use xlink:href="//external.com/defs.svg#shape"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(false)
  })
  it('accepts clean SVG without external references', () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50" fill="#0066cc"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(true)
  })
  it('accepts SVG with internal fragment use (href="#id" is safe)', () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><defs><circle id="c" r="10"/></defs><use href="#c"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(true)
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
  it('rejects SVG with HTML entity-encoded javascript: (bypass attempt)', () => {
    // &#106; = 'j', &#97; = 'a', &#118; = 'v' ... encodes "javascript:"
    // Parsers resolve entities before execution; we must too.
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><image href="&#106;avascript:alert(1)"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(false)
  })
  it('rejects SVG with hex-encoded entity bypass', () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><image href="&#x6A;avascript:alert(1)"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(false)
  })
  it('rejects SVG with CSS style url() injection', () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><rect style="background:url(javascript:alert(1))"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(false)
  })
  it('accepts SVG with safe inline style (no url())', () => {
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><rect style="fill:#ff0000;stroke:#000"/></svg>'
    const src = 'data:image/svg+xml;base64,' + btoa(payload)
    expect(isSafeImageSrc(src)).toBe(true)
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
const mockOutput = vi.fn().mockReturnValue(new Blob(['fake-pdf'], { type: 'application/pdf' }))
const mockAddImage = vi.fn()
const mockAddPage = vi.fn()

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    save: mockSave,
    output: mockOutput,
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

// Mock URL.createObjectURL and anchor click used by exportReportToPdf
const mockCreateObjectURL = vi.fn().mockReturnValue('blob:fake-url')
const mockRevokeObjectURL = vi.fn()
const mockAnchorClick = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  mockSave.mockReset()
  mockOutput.mockReturnValue(new Blob(['fake-pdf'], { type: 'application/pdf' }))
  mockAddImage.mockReset()
  mockAddPage.mockReset()

  Object.defineProperty(window, 'URL', {
    value: { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL },
    writable: true,
    configurable: true,
  })
  const originalCreate = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation((tag: string, ...args) => {
    if (tag === 'a') {
      const a = originalCreate('a') as HTMLAnchorElement
      a.click = mockAnchorClick
      return a
    }
    return originalCreate(tag, ...args)
  })
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
  it('throws when no elements provided', async () => {
    await expect(exportReportToPdf([])).rejects.toThrow('No pages to export')
    expect(mockHtml2canvas).not.toHaveBeenCalled()
  })

  it('creates PDF for single page and triggers download', async () => {
    const canvasMock = makeCanvasMock(595, 842)
    mockHtml2canvas.mockResolvedValue(canvasMock as unknown as HTMLCanvasElement)

    const el = document.createElement('div')
    await exportReportToPdf([el], 'report.pdf')

    expect(mockHtml2canvas).toHaveBeenCalledTimes(1)
    expect(mockAddImage).toHaveBeenCalledTimes(1)
    expect(mockOutput).toHaveBeenCalledWith('blob')
    expect(mockCreateObjectURL).toHaveBeenCalled()
    expect(mockAnchorClick).toHaveBeenCalled()
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
    expect(mockOutput).toHaveBeenCalledWith('blob')
  })

  it('throws error when html2canvas fails', async () => {
    mockHtml2canvas.mockRejectedValue(new Error('html2canvas failure'))

    const el = document.createElement('div')
    await expect(exportReportToPdf([el])).rejects.toThrow('PDF export failed: html2canvas failure')
  })
})

describe('isSafeImageSrc — additional edge cases', () => {
  it('rejects SVG data URI larger than 512KB', () => {
    // Build a large SVG URI that exceeds the 512KB limit
    const header = 'data:image/svg+xml;base64,'
    const bigPayload = 'A'.repeat(512 * 1024 + 1)
    const src = header + bigPayload
    expect(isSafeImageSrc(src)).toBe(false)
  })

  it('rejects SVG data URI with no comma separator', () => {
    // SVG URI without comma (malformed)
    expect(isSafeImageSrc('data:image/svg+xml;base64')).toBe(false)
  })

  it('accepts URL-encoded SVG (non-base64 path)', () => {
    // Simple clean SVG encoded as URL-encoded string (not base64)
    const payload = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/></svg>'
    const src = 'data:image/svg+xml,' + encodeURIComponent(payload)
    expect(isSafeImageSrc(src)).toBe(true)
  })

  it('rejects data URI with unsupported MIME type (pdf, text, etc)', () => {
    expect(isSafeImageSrc('data:application/pdf;base64,abc')).toBe(false)
    expect(isSafeImageSrc('data:text/html;base64,abc')).toBe(false)
  })
})
