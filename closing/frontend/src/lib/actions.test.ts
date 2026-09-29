import { describe, expect, it } from 'vitest'
import { assertCanOpen, parseWhole } from './actions'

describe('open form', () => {
  it('accepts a whole amount and the default fee before any wallet call', () => {
    expect(parseWhole('1,000,000')).toBe(1_000_000)
    expect(parseWhole('')).toBeNull()
    expect(assertCanOpen({
      label: 'Mineral interest',
      amountSats: 1_000_000,
      feeBps: 100,
      amendmentFeeSats: 0,
      sellerName: 'Seller',
      includeAgent: true,
      agentName: 'Closing agent'
    }).label).toBe('Mineral interest')
  })

  it('refuses a blank seller before a wallet exists', () => {
    expect(() => assertCanOpen({
      label: 'Mineral interest',
      amountSats: 1,
      feeBps: 100,
      amendmentFeeSats: 0,
      sellerName: ' ',
      includeAgent: false,
      agentName: ''
    })).toThrow(/seller/i)
  })
})
