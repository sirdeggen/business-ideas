import { describe, expect, it } from 'vitest'
import {
  formatUsd,
  formatUsdInput,
  moneyActionLabel,
  parseUsdAmount,
  preferOnScreenAmount,
  resolveSpend,
  tryParseUsdAmount,
  usdToSats
} from './money'

const FIXTURE_RATE = 50

describe('usdToSats uses the typed dollars', () => {
  it('parses and converts the way invoices/frontend/src/lib/money.ts does', () => {
    expect(parseUsdAmount('25.00')).toBe(25)
    expect(parseUsdAmount('$25.00')).toBe(25)
    expect(parseUsdAmount('1,250.5')).toBe(1250.5)
    expect(() => parseUsdAmount('0')).toThrow(/dollars/)
    expect(formatUsd(25)).toBe('$25.00')
    expect(formatUsdInput(25)).toBe('25.00')
    expect(usdToSats(25, FIXTURE_RATE)).toBe(50_000_000)
  })

  it('converts the live typed amount, not a leftover 25', () => {
    expect(parseUsdAmount('0.01')).toBe(0.01)
    const oneCent = usdToSats(0.01, FIXTURE_RATE)
    const twentyFive = usdToSats(25, FIXTURE_RATE)
    expect(oneCent).toBe(20_000)
    expect(twentyFive).toBe(50_000_000)
    expect(oneCent).not.toBe(twentyFive)
    const live = resolveSpend(preferOnScreenAmount('0.01', '25.00'), FIXTURE_RATE)
    expect(live.amountUsd).toBe('0.01')
    expect(live.amountSats).toBe(oneCent)
    expect(live.amountSats).not.toBe(twentyFive)
  })

  it('usdToSats(1.20, 14.925) is the typed $1.20, not a default', () => {
    const live = 14.925
    const typed = usdToSats(1.20, live)
    const leftover = usdToSats(25, live)
    expect(typed).toBe(8_040_201)
    expect(typed).not.toBe(leftover)
    const spend = resolveSpend('1.20', live, '25.00')
    expect(spend.amountSats).toBe(typed)
    expect(moneyActionLabel('Pay', spend.amountUsd, spend.amountSats)).toBe('Pay $1.20 · 8,040,201 sats')
  })

  it('rejects an empty live field instead of inventing a rate or amount', () => {
    expect(tryParseUsdAmount('')).toBeNull()
    expect(() => resolveSpend('', FIXTURE_RATE, '')).toThrow(/dollars/)
    expect(() => usdToSats(1, 0)).toThrow(/dollar rate/)
  })
})
