import { describe, expect, it } from 'vitest'
import { SAMPLE_PARTIES } from '../../../protocol/samples'
import { partyName, workRowTitle } from './display'
import { formatInvoiceAmount, formatUsd, satsToUsd } from './money'

const HEX = '0212d02d' + 'ab'.repeat(26) + 'b1a418'

describe('chase display', () => {
  it('prefers a display name and never titles a work row with a hex key', () => {
    expect(partyName('QA Debtor')).toBe('QA Debtor')
    expect(partyName(HEX)).toBe('')
    expect(partyName(HEX)).not.toMatch(/0212|b1a418|…/)
    expect(workRowTitle(HEX, 'QA-0813-DESK')).toBe('QA-0813-DESK')
    expect(workRowTitle('QA Debtor', 'QA-0813-DESK')).toBe('QA Debtor')
    expect(partyName(SAMPLE_PARTIES.northwind.identityKey)).toBe('Northwind Logistics')
  })

  it('formats invoice amounts as dollars and never leads with sats', () => {
    expect(formatUsd(2.45)).toBe('$2.45')
    expect(formatUsd('208.00')).toBe('$208.00')
    expect(satsToUsd(100_000_000, 50)).toBe(50)
    expect(formatInvoiceAmount(100_000_000, 50)).toBe('$50.00')
    expect(formatInvoiceAmount(1, 50)).toBe('$0.00')
    expect(formatInvoiceAmount(245, null)).toBe('')
    expect(formatInvoiceAmount(245, 50)).not.toMatch(/sats/i)
    expect(formatInvoiceAmount(1, 50)).not.toMatch(/sats/i)
  })
})
