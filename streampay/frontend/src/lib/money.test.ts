import { describe, expect, it } from 'vitest'
import { FUNDABLE_MAX_SATS } from '../../../protocol/stream'
import {
  formatSats,
  formatStreamUsd,
  parseSatsAmount,
  parseUsdAmount,
  satsToDisplayUsd,
  satsToUsdInput,
  usdToSats
} from './money'

describe('dollar display, sat settlement', () => {
  it('parses sats and never treats a dollar figure as the pot', () => {
    expect(parseSatsAmount('100000')).toBe(100_000)
    expect(parseSatsAmount('100,000 sats')).toBe(100_000)
    expect(parseSatsAmount('400')).toBe(400)
    expect(parseSatsAmount('400')).not.toBe(594_598_868)
  })

  it('parses dollars for the sheet; a $400 notional is still too big to fund', () => {
    expect(parseUsdAmount('0.07')).toBe(0.07)
    expect(parseUsdAmount('$0.07')).toBe(0.07)
    expect(usdToSats(0.07, 67)).toBe(Math.round((0.07 / 67) * 100_000_000))
    expect(usdToSats(0.07, 67)).toBeLessThan(FUNDABLE_MAX_SATS)
    expect(usdToSats(400, 67)).toBeGreaterThan(FUNDABLE_MAX_SATS)
    expect(parseSatsAmount('594598868')).toBeGreaterThan(FUNDABLE_MAX_SATS)
    expect(() => parseSatsAmount('$400')).toThrow(/sats/)
    expect(() => parseSatsAmount('400.00')).toThrow(/sats/)
  })

  it('formats sats as the settlement unit; USD is display only', () => {
    expect(formatSats(100_000)).toBe('100,000 sats')
    expect(satsToUsdInput(100_000, 67)).toBe('0.07')
    expect(satsToDisplayUsd(100_000, 67)).toBe('$0.07')
    expect(satsToDisplayUsd(14, 67)).toBe('')
    expect(satsToDisplayUsd(100_000, null)).toBe('')
    expect(formatStreamUsd(0.07)).toBe('$0.07')
    expect(formatStreamUsd(0.005)).toBe('$0.005')
    expect(formatStreamUsd(0)).toBe('')
  })
})
