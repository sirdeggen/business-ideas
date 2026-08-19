import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  displayUsd,
  formatSats,
  formatUsd,
  formatUsdInput,
  parseUsdAmount,
  preferOnScreenAmount,
  readLiveAmountField,
  resolveGiftSpend,
  satsToUsd,
  sendGiftLabel,
  usdToSats
} from './money.ts'

const FIXTURE_RATE = 50

describe('dollars (fixture rate, no network)', () => {
  it('parses and formats the way invoices does', () => {
    assert.equal(parseUsdAmount('25.00'), 25)
    assert.equal(parseUsdAmount('$25.00'), 25)
    assert.equal(parseUsdAmount('1,250.5'), 1250.5)
    assert.throws(() => parseUsdAmount('0'), /dollars/)
    assert.equal(formatUsd(25), '$25.00')
    assert.equal(formatUsdInput(25), '25.00')
    assert.equal(usdToSats(25, FIXTURE_RATE), 50_000_000)
    assert.equal(satsToUsd(50_000_000, FIXTURE_RATE), 25)
    assert.equal(displayUsd('25.00'), '$25.00')
    assert.equal(displayUsd(undefined, 12_000, null), 'a gift')
  })

  it('parses and converts 0.01 differently from the 25 default', () => {
    assert.equal(parseUsdAmount('0.01'), 0.01)
    assert.equal(parseUsdAmount('25.00'), 25)
    const oneCent = usdToSats(0.01, FIXTURE_RATE)
    const twentyFive = usdToSats(25, FIXTURE_RATE)
    assert.equal(oneCent, 20_000)
    assert.equal(twentyFive, 50_000_000)
    assert.notEqual(oneCent, twentyFive)
    assert.equal(resolveGiftSpend('0.01', FIXTURE_RATE).amountSats, oneCent)
    assert.notEqual(resolveGiftSpend('0.01', FIXTURE_RATE).amountSats, twentyFive)
  })

  it('send uses the live Amount field, never a leftover 25', () => {
    const field = readLiveAmountField({ value: '0.01' })
    assert.equal(field, '0.01')
    const spend = resolveGiftSpend(field, FIXTURE_RATE, '25.00')
    const defaultSpend = resolveGiftSpend('25.00', FIXTURE_RATE)
    assert.equal(spend.amountUsd, '0.01')
    assert.equal(spend.amountSats, usdToSats(0.01, FIXTURE_RATE))
    assert.notEqual(spend.amountSats, defaultSpend.amountSats)
    assert.equal(sendGiftLabel(spend.amountUsd), 'Send $0.01')
    assert.equal(sendGiftLabel('25.00'), 'Send $25.00')
    assert.throws(() => resolveGiftSpend('', FIXTURE_RATE), /dollars/)
    assert.throws(() => resolveGiftSpend('', FIXTURE_RATE, ''), /dollars/)
    assert.throws(() => resolveGiftSpend('25.00 leftover ignored', FIXTURE_RATE), /dollars/)
  })

  it('typed 0.01 wins over defaultValue/preview 25; empty never becomes 25', () => {
    assert.equal(preferOnScreenAmount('0.01', '25.00'), '0.01')
    const stalePreview = resolveGiftSpend('0.01', FIXTURE_RATE, '25.00')
    assert.equal(stalePreview.amountSats, usdToSats(0.01, FIXTURE_RATE))
    assert.notEqual(stalePreview.amountSats, usdToSats(25, FIXTURE_RATE))
    assert.equal(sendGiftLabel(preferOnScreenAmount('0.01', '25.00')), 'Send $0.01')
    assert.equal(preferOnScreenAmount('', ''), '')
    assert.throws(() => resolveGiftSpend('', FIXTURE_RATE, ''), /dollars/)
  })

  it('usdToSats(0.01, 14.985) is ~66,733, not the $25 default', () => {
    const live = 14.985
    const oneCent = usdToSats(0.01, live)
    const twentyFive = usdToSats(25, live)
    assert.equal(oneCent, 66_733)
    assert.notEqual(oneCent, twentyFive)
    assert.ok(twentyFive > 160_000_000)
    assert.equal(resolveGiftSpend('0.01', live).amountSats, oneCent)
    assert.notEqual(resolveGiftSpend('0.01', live).amountSats, twentyFive)
  })

  it('sendGiftLabel includes sats when a live rate exists', () => {
    const live = 14.985
    assert.equal(sendGiftLabel('0.01', live), `Send $0.01 (${formatSats(66_733)})`)
    assert.equal(sendGiftLabel('0.01', live), 'Send $0.01 (66,733 sats)')
    assert.equal(sendGiftLabel('0.01', live, '25.00'), 'Send $0.01 (66,733 sats)')
    assert.notEqual(sendGiftLabel('0.01', live), sendGiftLabel('25.00', live))
    assert.equal(sendGiftLabel('0.01'), 'Send $0.01')
    assert.equal(sendGiftLabel('0.01', null), 'Send $0.01')
    assert.equal(sendGiftLabel('0.01', 0), 'Send $0.01')
  })
})
