import { expect } from 'vitest'
import * as jestDomMatchers from '@testing-library/jest-dom/matchers'
// Register jest-dom matchers explicitly instead of the `@testing-library/jest-dom`
// side-effect entry. That entry ships types that augment `jest.Matchers`, which
// vitest <= 4 bridged into its own `Assertion` but vitest 5 no longer does
// (upstream: testing-library/jest-dom#738). The vitest-5-compatible type
// augmentation lives in ./jest-dom-matchers.d.ts.
expect.extend(jestDomMatchers)
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
