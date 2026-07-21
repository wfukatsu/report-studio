import '@testing-library/jest-dom'
// Initialize i18next once for the whole test run. config.ts pins the language to
// `ja` under test (MODE === 'test'), so existing Japanese-text assertions stay
// deterministic, and turns unknown keys into thrown errors (#329).
import '@/i18n/config'

// jsdom does not implement PointerEvent — provide a minimal polyfill for tests
// that dispatch pointermove/pointerup on window (e.g. CanvasElement resize tests).
if (typeof window !== 'undefined' && !('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init)
      this.pointerId = init.pointerId ?? 0
    }
  }
  Object.defineProperty(window, 'PointerEvent', {
    value: PointerEventPolyfill,
    writable: true,
    configurable: true,
  })
}
