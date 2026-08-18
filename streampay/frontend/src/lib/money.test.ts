import { describe, expect, it } from 'vitest'
import { FUNDABLE_MAX_SATS } from '../../../protocol/stream'
import { formatSats, parseSatsAmount, satsToDisplayUsd, satsToUsdInput } from './money'

describe('sat-denominated open amounts', () => {
  it('parses sats and never converts a dollar figure at spot', () => {
    expect(parseSatsAmount('100000')).toBe(100_000)
    expect(parseSatsAmount('100,000 sats')).toBe(100_000)
    expect(parseSatsAmount('400')).toBe(400)
    expect(parseSatsAmount('400')).not.toBe(594_598_868)
  })

  it('rejects a $400-sized notional a 1.2M sat wallet cannot fund', () => {
    expect(parseSatsAmount('594598868')).toBeGreaterThan(FUNDABLE_MAX_SATS)
    expect(() => parseSatsAmount('$400')).toThrow(/sats/)
    expect(() => parseSatsAmount('400.00')).toThrow(/sats/)
  })

  it('formats sats as the settlement unit; USD is display only', () => {
    expect(formatSats(100_000)).toBe('100,000 sats')
    expect(satsToUsdInput(100_000, 67)).toBe('0.07')
    expect(satsToDisplayUsd(100_000, 67)).toBe('$0.07')
    expect(satsToDisplayUsd(100_000, null)).toBe('')
  })
})
