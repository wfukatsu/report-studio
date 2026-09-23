// Type augmentation that exposes @testing-library/jest-dom matchers
// (`toBeInTheDocument`, `toHaveAttribute`, ...) on vitest's `expect`.
//
// vitest 5 changed `Assertion` to `Assertion<R, T>` (R = return type, T = value
// type) and dropped the `jest.Matchers` bridge that jest-dom's bundled types
// relied on. jest-dom's own `./vitest` types still declare `Assertion<T>`, which
// no longer merges (TS2428) — see testing-library/jest-dom#738. Until jest-dom
// ships vitest-5 types, this file provides the equivalent augmentation.
// Runtime registration happens in ./setup.ts via `expect.extend`.
import 'vitest'
import type { TestingLibraryMatchers } from '@testing-library/jest-dom/matchers'

declare module 'vitest' {
  // Empty `extends` interfaces are the declaration-merging idiom, and the type
  // parameter names must match vitest's declaration exactly for the merge to
  // happen (`T` is therefore declared but unused).
  /* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
  interface Assertion<R, T> extends TestingLibraryMatchers<unknown, R> {}
  interface AsymmetricMatchersContaining extends TestingLibraryMatchers<unknown, unknown> {}
  /* eslint-enable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unused-vars */
}
