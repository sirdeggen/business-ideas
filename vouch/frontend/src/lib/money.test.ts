import { describe, expect, it } from 'vitest'
import { DEFAULT_BOND_SATS, FEE_SATS } from '../../../protocol/vouch'
import { priceFace, satsToUsd } from './money'

describe('dollar face', () => {
  it('omits a face price that would print as $0.00', () => {
    expect(satsToUsd(3600, 50)).toBe('')
    expect(priceFace(3600, 50)).toBe('')
    expect(priceFace(FEE_SATS, null)).toBe('')
  })

  it('shows dollars when the write fee or bond is at least one cent', () => {
    expect(satsToUsd(100_000_000, 50)).toBe('$50.00')
    expect(priceFace(FEE_SATS, 50)).toBe('$0.05')
    expect(priceFace(DEFAULT_BOND_SATS, 50)).toBe('$0.50')
  })
})
