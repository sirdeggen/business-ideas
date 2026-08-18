import { describe, expect, it } from 'vitest'
import { formatSats, formatSatsAmount, formatSatsUsd } from './money'

describe('record-desk sat amounts', () => {
  it('uses sat for 1 and sats otherwise', () => {
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(10)).toBe('10 sats')
    expect(formatSats(100_000)).toBe('100,000 sats')
  })

  it('hides USD when the rate is missing or rounds to a penny or less', () => {
    expect(formatSatsUsd(1, null)).toBe('')
    expect(formatSatsUsd(10, null)).toBe('')
    expect(formatSatsUsd(1, 0)).toBe('')
    expect(formatSatsUsd(1, 67)).toBe('')
    expect(formatSatsUsd(10, 67)).toBe('')
    expect(formatSatsUsd(100_000, 67)).toBe('$0.07')
  })

  it('leads with sats and never appends $0.00 or $0.01', () => {
    expect(formatSatsAmount(1, null)).toBe('1 sat')
    expect(formatSatsAmount(10, null)).toBe('10 sats')
    expect(formatSatsAmount(1, 67)).toBe('1 sat')
    expect(formatSatsAmount(10, 67)).toBe('10 sats')
    expect(formatSatsAmount(1, 67)).not.toMatch(/\$0\.00/)
    expect(formatSatsAmount(10, 67)).not.toMatch(/\$0\.00/)
    expect(formatSatsAmount(1, 67)).not.toMatch(/\$0\.01/)
    expect(formatSatsAmount(100_000, 67)).toBe('100,000 sats ($0.07)')
  })
})
