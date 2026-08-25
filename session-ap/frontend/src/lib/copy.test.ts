import { describe, expect, it } from 'vitest'
import {
  FIRST_PAINT,
  PAYER_NAME_PLACEHOLDER,
  advancedSatsLine,
  lineFace,
  lineFaceAmount,
  moneyActionLabel,
  partyFaceName
} from './copy'
import { shortKey } from './config'

const PAYER = '02c5313bc21f0a61418640c94a23d3cdb09ea50a8a3dd8daababe93f57a5fa0082'
const HASH = '2b4ad31adad0c899a981c3cfbcdb38e41048a16be77681644faa712e8f0174cc'

describe('first paint payer is a name', () => {
  it('does not say Their account', () => {
    expect(FIRST_PAINT.payerPlaceholder).toBe(PAYER_NAME_PLACEHOLDER)
    expect(FIRST_PAINT.payerPlaceholder).toBe('Alex')
    expect(FIRST_PAINT.payerPlaceholder.toLowerCase()).not.toContain('account')
    expect(FIRST_PAINT.payerPlaceholder).not.toBe('Their account')
    expect(FIRST_PAINT.payerLabel).toBe('Payer')
  })
})

describe('book sheet parties are names', () => {
  it('shows a name and never shortKey hex', () => {
    expect(partyFaceName('Alex')).toBe('Alex')
    expect(partyFaceName('Northstar')).toBe('Northstar')
    expect(partyFaceName(PAYER)).toBe('')
    expect(partyFaceName(shortKey(PAYER))).toBe('')
    expect(partyFaceName(shortKey(PAYER))).not.toMatch(/[0-9a-fA-F]{6}/)
    expect(partyFaceName('')).toBe('')
  })
})

describe('line face is label + dollars', () => {
  it('keeps the receipt hash off the face', () => {
    const face = lineFace({
      label: 'Article fetch',
      amountUsd: '0.60',
      receiptHash: HASH
    })
    expect(face.label).toBe('Article fetch')
    expect(face.amount).toBe('$0.60')
    expect(JSON.stringify(face)).not.toContain(HASH)
    expect(JSON.stringify(face).toLowerCase()).not.toContain('receipt')
  })

  it('skips the amount when there is no dollar — no billed sat fallback', () => {
    expect(lineFaceAmount('')).toBe('')
    expect(lineFaceAmount(undefined)).toBe('')
    const face = lineFace({ label: 'Search page', amountUsd: '', receiptHash: HASH })
    expect(face.amount).toBe('')
    expect(face.amount).not.toMatch(/billed/i)
    expect(face.amount).not.toMatch(/sats/i)
    expect(face.amount).not.toContain('18,291')
  })
})

describe('Pay and Send are dollars only', () => {
  it('does not put sats on the primary', () => {
    expect(moneyActionLabel('Pay', '12.40')).toBe('Pay $12.40')
    expect(moneyActionLabel('Send', 0.60)).toBe('Send $0.60')
    expect(moneyActionLabel('Pay', '12.40')).not.toMatch(/sats/i)
    expect(moneyActionLabel('Pay', '12.40')).not.toContain('·')
    expect(moneyActionLabel('Pay', '')).toBe('Pay')
    expect(advancedSatsLine(18_291)).toBe('18,291 sats')
  })
})
