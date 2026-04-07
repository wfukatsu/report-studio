import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore } from '@/store'
import { CACHE_TTL_MS } from '@/store/responsesSlice'
import type { FormResponseSummary } from '@/lib/schemas/formResponse'

const makeSummary = (id: string): FormResponseSummary => ({
  id,
  templateId: 'tpl-1',
  submittedAt: Date.now(),
  submittedBy: 'user-1',
  summary: [`field: value`],
})

beforeEach(() => {
  useReportStore.getState().newReport()
  useReportStore.getState().invalidateResponsesCache()
  useReportStore.setState({ responses: [], responsesTotal: 0, responsesLoading: false, submitResponseModalOpen: false })
})

describe('responsesSlice — CACHE_TTL_MS', () => {
  it('exports a 5-minute TTL constant', () => {
    expect(CACHE_TTL_MS).toBe(5 * 60 * 1000)
  })
})

describe('responsesSlice — setResponses', () => {
  it('stores items and total, stamps cacheTime', () => {
    const before = Date.now()
    const items = [makeSummary('r1'), makeSummary('r2')]
    useReportStore.getState().setResponses(items, 5)
    const s = useReportStore.getState()
    expect(s.responses).toHaveLength(2)
    expect(s.responsesTotal).toBe(5)
    expect(s.responsesCacheTime).toBeGreaterThanOrEqual(before)
  })

  it('replaces previous responses on subsequent call', () => {
    useReportStore.getState().setResponses([makeSummary('r1')], 1)
    useReportStore.getState().setResponses([makeSummary('r2'), makeSummary('r3')], 10)
    const s = useReportStore.getState()
    expect(s.responses.map((r) => r.id)).toEqual(['r2', 'r3'])
    expect(s.responsesTotal).toBe(10)
  })

  it('handles empty list', () => {
    useReportStore.getState().setResponses([makeSummary('r1')], 1)
    useReportStore.getState().setResponses([], 0)
    const s = useReportStore.getState()
    expect(s.responses).toHaveLength(0)
    expect(s.responsesTotal).toBe(0)
  })
})

describe('responsesSlice — setResponsesLoading', () => {
  it('sets loading flag to true', () => {
    useReportStore.getState().setResponsesLoading(true)
    expect(useReportStore.getState().responsesLoading).toBe(true)
  })

  it('sets loading flag to false', () => {
    useReportStore.getState().setResponsesLoading(true)
    useReportStore.getState().setResponsesLoading(false)
    expect(useReportStore.getState().responsesLoading).toBe(false)
  })
})

describe('responsesSlice — invalidateResponsesCache', () => {
  it('resets cacheTime to 0', () => {
    useReportStore.getState().setResponses([makeSummary('r1')], 1)
    expect(useReportStore.getState().responsesCacheTime).toBeGreaterThan(0)
    useReportStore.getState().invalidateResponsesCache()
    expect(useReportStore.getState().responsesCacheTime).toBe(0)
  })
})

describe('responsesSlice — submitResponseModal', () => {
  it('opens the submit modal', () => {
    expect(useReportStore.getState().submitResponseModalOpen).toBe(false)
    useReportStore.getState().openSubmitResponseModal()
    expect(useReportStore.getState().submitResponseModalOpen).toBe(true)
  })

  it('closes the submit modal', () => {
    useReportStore.getState().openSubmitResponseModal()
    useReportStore.getState().closeSubmitResponseModal()
    expect(useReportStore.getState().submitResponseModalOpen).toBe(false)
  })
})
