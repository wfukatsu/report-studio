import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DataGridToolbar } from './DataGridToolbar'
import { exportToCsv } from './exportToCsv'

vi.mock('@/api/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api/client')>()
  return { ...actual, downloadBlob: vi.fn() }
})

import { downloadBlob } from '@/api/client'
const mockDownloadBlob = vi.mocked(downloadBlob)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('DataGridToolbar', () => {
  const baseProps = {
    searchQuery: '',
    onSearchChange: vi.fn(),
    onExportCsv: vi.fn(),
    totalRows: 0,
  }

  it('propagates search input changes', () => {
    const onSearchChange = vi.fn()
    render(<DataGridToolbar {...baseProps} onSearchChange={onSearchChange} />)
    fireEvent.change(screen.getByLabelText('データを検索'), { target: { value: '見積' } })
    expect(onSearchChange).toHaveBeenCalledWith('見積')
  })

  it('shows the row count with ja-JP thousands separators', () => {
    render(<DataGridToolbar {...baseProps} totalRows={12345} />)
    expect(screen.getByText('12,345 件')).toBeInTheDocument()
  })

  it('shows the truncation warning only when truncated', () => {
    const { rerender } = render(<DataGridToolbar {...baseProps} />)
    expect(screen.queryByText('上位 10,000 件のみ表示')).not.toBeInTheDocument()
    rerender(<DataGridToolbar {...baseProps} truncated />)
    expect(screen.getByText('上位 10,000 件のみ表示')).toBeInTheDocument()
  })

  it('invokes onExportCsv when the CSV button is clicked', () => {
    const onExportCsv = vi.fn()
    render(<DataGridToolbar {...baseProps} onExportCsv={onExportCsv} />)
    fireEvent.click(screen.getByRole('button', { name: 'CSVエクスポート' }))
    expect(onExportCsv).toHaveBeenCalledTimes(1)
  })
})

describe('exportToCsv', () => {
  // jsdom's Blob does not implement .text() — read via FileReader instead
  function blobText(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(reader.error)
      reader.readAsText(blob)
    })
  }

  it('builds a header + body CSV and downloads it with the given filename', async () => {
    exportToCsv(['id', 'name'], [{ id: 1, name: 'Alpha' }, { id: 2, name: 'Beta' }], 'out.csv')
    expect(mockDownloadBlob).toHaveBeenCalledTimes(1)
    const [blob, filename] = mockDownloadBlob.mock.calls[0]
    expect(filename).toBe('out.csv')
    expect(await blobText(blob as Blob)).toBe('id,name\n1,Alpha\n2,Beta')
  })

  it('escapes commas, quotes and newlines per RFC 4180', async () => {
    exportToCsv(
      ['v'],
      [{ v: 'a,b' }, { v: 'say "hi"' }, { v: 'line1\nline2' }],
      'escaped.csv',
    )
    const [blob] = mockDownloadBlob.mock.calls[0]
    expect(await blobText(blob as Blob)).toBe('v\n"a,b"\n"say ""hi"""\n"line1\nline2"')
  })

  it('serializes null/undefined cells as empty strings', async () => {
    exportToCsv(['a', 'b'], [{ a: null, b: undefined }], 'empty.csv')
    const [blob] = mockDownloadBlob.mock.calls[0]
    expect(await blobText(blob as Blob)).toBe('a,b\n,')
  })
})
