import { describe, expect, it } from 'vitest'
import { SAMPLE_PARTIES } from '../../../protocol/samples'
import { agePhrase, partyName, rowStatus, rowStatusLabel, workRowTitle } from './display'
import { formatInvoiceAmount, formatUsd, parseUsdAmount, satsToUsd, usdToSats } from './money'

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
    expect(formatInvoiceAmount(1, 50)).not.toBe('0')
    expect(formatInvoiceAmount(245, null)).toBe('')
    expect(formatInvoiceAmount(1, null)).toBe('')
    expect(formatInvoiceAmount(245, 50)).not.toMatch(/sats/i)
    expect(formatInvoiceAmount(1, 50)).not.toMatch(/sats/i)
    expect(parseUsdAmount('50.00')).toBe(50)
    expect(parseUsdAmount('$2.45')).toBe(2.45)
    expect(usdToSats(50, 50)).toBe(100_000_000)
    expect(() => parseUsdAmount('0')).toThrow(/dollars/)
  })

  it('speaks age as a phrase and uses one honest status word', () => {
    expect(agePhrase('2026-08-09', '2026-08-21')).toBe('12 days overdue')
    expect(agePhrase('2026-08-20', '2026-08-21')).toBe('1 day overdue')
    expect(agePhrase('2026-08-21', '2026-08-21')).toBe('Due today')
    expect(agePhrase('2026-08-22', '2026-08-21')).toBe('Due tomorrow')
    expect(agePhrase('2026-08-28', '2026-08-21')).toBe('Due Fri')
    expect(rowStatus('open', '2026-08-09', '2026-08-21')).toBe('overdue')
    expect(rowStatus('open', '2026-09-30', '2026-08-21')).toBe('open')
    expect(rowStatus('approved', '2026-09-30', '2026-08-21')).toBe('approved')
    expect(rowStatus('paid', '2026-08-01', '2026-08-21')).toBe('paid')
    expect(rowStatusLabel('overdue')).toBe('Overdue')
    expect(rowStatusLabel('open')).toBe('Open')
  })
})
