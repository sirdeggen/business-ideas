import { describe, expect, it } from 'vitest'
import { assertCanIssue, parseWhole } from './actions'

describe('issue form', () => {
  it('accepts a setup fee and the default basis points before any wallet call', () => {
    expect(parseWhole('5,000')).toBe(5_000)
    expect(parseWhole('')).toBeNull()
    const ready = assertCanIssue({
      orgName: 'North Campus Union',
      brandName: 'Campus Cash',
      ticker: 'CAMP',
      unitLabel: 'Campus Cash',
      setupFeeSats: 5_000,
      mintFeeBps: 50,
      redeemFeeBps: 25,
      satsPerUnit: 1
    })
    expect(ready.orgName).toBe('North Campus Union')
    expect(ready.setupFeeSats).toBe(5_000)
  })

  it('refuses a blank org before a wallet exists', () => {
    expect(() => assertCanIssue({
      orgName: ' ',
      brandName: 'Campus Cash',
      ticker: 'CAMP',
      unitLabel: 'Campus Cash',
      setupFeeSats: 1,
      mintFeeBps: 50,
      redeemFeeBps: 25,
      satsPerUnit: 1
    })).toThrow(/org/i)
  })
})
