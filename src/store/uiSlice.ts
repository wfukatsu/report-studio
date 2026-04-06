/**
 * UI slice — view-only state: zoom, grid, preview mode, clipboard, backend connection.
 */

import type { StateCreator } from 'zustand'
import type { ReportElement } from '@/types'
import type { StoreState } from './types'
import { ZOOM_MIN, ZOOM_MAX } from '@/config/constants'

export type UISlice = Pick<StoreState,
  | 'previewMode'
  | 'editorZoom'
  | 'previewZoom'
  | 'showGrid'
  | 'snapToGrid'
  | 'showTrimMarks'
  | 'gridSize'
  | 'clipboard'
  | 'headerEditMode'
  | 'livePreviewEnabled'
  | 'backendConnected'
  | 'currentTemplateId'
  | 'loadState'
  | 'saveState'
  | 'loadGeneration'
  | 'layerSearchQuery'
  | 'setPreviewMode'
  | 'setZoom'
  | 'setEditorZoom'
  | 'setPreviewZoom'
  | 'toggleGrid'
  | 'toggleSnapToGrid'
  | 'toggleTrimMarks'
  | 'toggleHeaderEditMode'
  | 'toggleLivePreview'
  | 'setHeaderEditMode'
  | 'setLivePreviewEnabled'
  | 'setBackendConnected'
  | 'setCurrentTemplateId'
  | 'setLoadState'
  | 'setSaveState'
  | 'incrementLoadGeneration'
  | 'setLayerSearchQuery'
>

export const createUISlice: StateCreator<
  StoreState,
  [['zustand/immer', never]],
  [],
  UISlice
> = (set) => ({
  previewMode: false,
  layerSearchQuery: '',
  editorZoom: 1.0,
  previewZoom: 1.0,
  showGrid: false,
  snapToGrid: false,
  showTrimMarks: false,
  gridSize: 5,
  clipboard: null as ReportElement[] | null,
  headerEditMode: false,
  livePreviewEnabled: false,
  backendConnected: false,
  currentTemplateId: null,
  loadState: 'idle',
  saveState: 'idle',
  loadGeneration: 0,

  setPreviewMode: (enabled) => set((s) => { s.previewMode = enabled }),

  setZoom: (zoom) => set((s) => {
    const clamped = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
    s.editorZoom = clamped
    s.previewZoom = clamped
  }),

  setEditorZoom: (zoom) => set((s) => {
    s.editorZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
  }),

  setPreviewZoom: (zoom) => set((s) => {
    s.previewZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom))
  }),

  toggleGrid: () => set((s) => { s.showGrid = !s.showGrid }),

  toggleSnapToGrid: () => set((s) => { s.snapToGrid = !s.snapToGrid }),

  toggleTrimMarks: () => set((s) => { s.showTrimMarks = !s.showTrimMarks }),

  toggleHeaderEditMode: () => set((s) => { s.headerEditMode = !s.headerEditMode }),

  toggleLivePreview: () => set((s) => { s.livePreviewEnabled = !s.livePreviewEnabled }),

  setHeaderEditMode: (enabled) => set((s) => { s.headerEditMode = enabled }),

  setLivePreviewEnabled: (enabled) => set((s) => { s.livePreviewEnabled = enabled }),

  setBackendConnected: (connected) => set((s) => { s.backendConnected = connected }),

  setCurrentTemplateId: (id) => set((s) => { s.currentTemplateId = id }),

  setLoadState: (state) => set((s) => { s.loadState = state }),

  setSaveState: (state) => set((s) => { s.saveState = state }),

  incrementLoadGeneration: () => set((s) => { s.loadGeneration += 1 }),

  setLayerSearchQuery: (query) => set((s) => { s.layerSearchQuery = query }),
})
