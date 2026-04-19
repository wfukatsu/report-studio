import { describe, it, expect } from 'vitest'
import { formatAddress } from './formatAddress'

describe('formatAddress', () => {
  // ── single mode ──────────────────────────────────────────────────────
  describe('single mode', () => {
    it('formats full address with postal code', () => {
      expect(formatAddress({
        postalCode: '100-0001',
        address1: '東京都千代田区千代田',
        address2: '1-1-1',
      })).toBe('〒100-0001 東京都千代田区千代田1-1-1')
    })

    it('omits postal prefix when postalCode is undefined', () => {
      expect(formatAddress({
        address1: '東京都千代田区千代田',
        address2: '1-1-1',
      })).toBe('東京都千代田区千代田1-1-1')
    })

    it('handles address2 being empty', () => {
      expect(formatAddress({
        postalCode: '100-0001',
        address1: '東京都千代田区千代田',
      })).toBe('〒100-0001 東京都千代田区千代田')
    })

    it('falls back to address when address1 is undefined', () => {
      expect(formatAddress({
        postalCode: '100-0001',
        address: '東京都千代田区千代田1-1-1',
      })).toBe('〒100-0001 東京都千代田区千代田1-1-1')
    })

    it('returns empty string when all fields are empty', () => {
      expect(formatAddress({})).toBe('')
    })

    it('defaults to single mode when mode is omitted', () => {
      expect(formatAddress({
        postalCode: '100-0001',
        address1: '東京都千代田区千代田',
        address2: '1-1-1',
      })).toBe('〒100-0001 東京都千代田区千代田1-1-1')
    })
  })

  // ── multiLine mode ───────────────────────────────────────────────────
  describe('multiLine mode', () => {
    it('formats full address as 3 lines', () => {
      expect(formatAddress({
        postalCode: '100-0001',
        address1: '東京都千代田区千代田',
        address2: '1-1-1',
      }, 'multiLine')).toBe('〒100-0001\n東京都千代田区千代田\n1-1-1')
    })

    it('suppresses empty address2 line', () => {
      expect(formatAddress({
        postalCode: '100-0001',
        address1: '東京都千代田区千代田',
      }, 'multiLine')).toBe('〒100-0001\n東京都千代田区千代田')
    })

    it('omits postal line when postalCode is undefined', () => {
      expect(formatAddress({
        address1: '東京都千代田区千代田',
        address2: '1-1-1',
      }, 'multiLine')).toBe('東京都千代田区千代田\n1-1-1')
    })

    it('falls back to address when address1 is undefined', () => {
      expect(formatAddress({
        postalCode: '100-0001',
        address: '東京都千代田区千代田1-1-1',
      }, 'multiLine')).toBe('〒100-0001\n東京都千代田区千代田1-1-1')
    })

    it('returns empty string when all fields are empty', () => {
      expect(formatAddress({}, 'multiLine')).toBe('')
    })

    it('handles only postalCode being set', () => {
      expect(formatAddress({
        postalCode: '100-0001',
      }, 'multiLine')).toBe('〒100-0001')
    })
  })
})
