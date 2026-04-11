import { describe, it, expect } from 'vitest'
import { constrainDelta } from './axisConstraint'

describe('constrainDelta', () => {
  describe('shift=false', () => {
    it('returns delta unchanged when shift is off', () => {
      expect(constrainDelta({ x: 10, y: 20 }, false)).toEqual({ x: 10, y: 20 })
    })

    it('returns negative deltas unchanged', () => {
      expect(constrainDelta({ x: -15, y: -5 }, false)).toEqual({ x: -15, y: -5 })
    })

    it('returns zero delta unchanged', () => {
      expect(constrainDelta({ x: 0, y: 0 }, false)).toEqual({ x: 0, y: 0 })
    })
  })

  describe('shift=true — horizontal dominant', () => {
    it('zeroes y when |dx| > |dy|', () => {
      expect(constrainDelta({ x: 20, y: 5 }, true)).toEqual({ x: 20, y: 0 })
    })

    it('works with negative x', () => {
      expect(constrainDelta({ x: -30, y: 10 }, true)).toEqual({ x: -30, y: 0 })
    })
  })

  describe('shift=true — vertical dominant', () => {
    it('zeroes x when |dy| > |dx|', () => {
      expect(constrainDelta({ x: 3, y: 50 }, true)).toEqual({ x: 0, y: 50 })
    })

    it('works with negative y', () => {
      expect(constrainDelta({ x: 2, y: -40 }, true)).toEqual({ x: 0, y: -40 })
    })
  })

  describe('shift=true — tie-breaker (|dx| === |dy|)', () => {
    it('prefers horizontal axis on equal magnitude', () => {
      expect(constrainDelta({ x: 10, y: 10 }, true)).toEqual({ x: 10, y: 0 })
    })

    it('prefers horizontal axis on equal negative magnitude', () => {
      expect(constrainDelta({ x: -7, y: 7 }, true)).toEqual({ x: -7, y: 0 })
    })
  })

  describe('edge cases', () => {
    it('handles fractional values', () => {
      expect(constrainDelta({ x: 0.5, y: 0.3 }, true)).toEqual({ x: 0.5, y: 0 })
    })

    it('zeroes both axes when both are zero with shift', () => {
      expect(constrainDelta({ x: 0, y: 0 }, true)).toEqual({ x: 0, y: 0 })
    })
  })
})
