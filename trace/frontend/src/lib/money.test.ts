import { describe, expect, it } from 'vitest'
import { FEE_SATS } from '../../../protocol/trace'
import { priceFace, satsToUsd } from './money'

describe('dollar face', () => {
  it('omits a face price that would print as $0.00', () => {
    expect(satsToUsd(3600, 50)).toBe('')
    expect(priceFace(3600, 50)).toBe('')
    expect(priceFace(FEE_SATS, null)).toBe('')
  })

  it('shows dollars when the register fee is at least one cent', () => {
    expect(satsToUsd(100_000_000, 50)).toBe('$50.00')
    expect(priceFace(FEE_SATS, 50)).toBe('$0.05')
    expect(priceFace(200_000, 50)).toBe('$0.10')
  })
})
