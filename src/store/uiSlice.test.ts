import { describe, it, expect, beforeEach } from 'vitest'
import { useReportStore } from '@/store'
import { ZOOM_MIN, ZOOM_MAX } from '@/config/constants'

beforeEach(() => {
  useReportStore.getState().newReport()
})

describe('uiSlice — setZoom', () => {
  it('sets both editorZoom and previewZoom to the same value', () => {
    useReportStore.getState().setZoom(1.5)
    const state = useReportStore.getState()
    expect(state.editorZoom).toBe(1.5)
    expect(state.previewZoom).toBe(1.5)
  })

  it('clamps setZoom to ZOOM_MIN', () => {
    useReportStore.getState().setZoom(0.001)
    const state = useReportStore.getState()
    expect(state.editorZoom).toBe(ZOOM_MIN)
    expect(state.previewZoom).toBe(ZOOM_MIN)
  })

  it('clamps setZoom to ZOOM_MAX', () => {
    useReportStore.getState().setZoom(100)
    const state = useReportStore.getState()
    expect(state.editorZoom).toBe(ZOOM_MAX)
    expect(state.previewZoom).toBe(ZOOM_MAX)
  })
})

describe('uiSlice — setPreviewZoom', () => {
  it('sets only previewZoom', () => {
    useReportStore.getState().setEditorZoom(1.0)
    useReportStore.getState().setPreviewZoom(2.0)
    const state = useReportStore.getState()
    expect(state.editorZoom).toBe(1.0)
    expect(state.previewZoom).toBe(2.0)
  })

  it('clamps setPreviewZoom to ZOOM_MIN', () => {
    useReportStore.getState().setPreviewZoom(0.001)
    expect(useReportStore.getState().previewZoom).toBe(ZOOM_MIN)
  })

  it('clamps setPreviewZoom to ZOOM_MAX', () => {
    useReportStore.getState().setPreviewZoom(100)
    expect(useReportStore.getState().previewZoom).toBe(ZOOM_MAX)
  })
})

describe('uiSlice — setEditorZoom', () => {
  it('sets only editorZoom', () => {
    useReportStore.getState().setEditorZoom(1.75)
    expect(useReportStore.getState().editorZoom).toBe(1.75)
  })
})

describe('uiSlice — toggleMarginGuide / setHeaderEditMode', () => {
  it('toggleMarginGuide toggles showMarginGuide', () => {
    const initial = useReportStore.getState().showMarginGuide
    useReportStore.getState().toggleMarginGuide()
    expect(useReportStore.getState().showMarginGuide).toBe(!initial)
  })

  it('setHeaderEditMode sets headerEditMode', () => {
    useReportStore.getState().setHeaderEditMode(true)
    expect(useReportStore.getState().headerEditMode).toBe(true)
    useReportStore.getState().setHeaderEditMode(false)
    expect(useReportStore.getState().headerEditMode).toBe(false)
  })
})
