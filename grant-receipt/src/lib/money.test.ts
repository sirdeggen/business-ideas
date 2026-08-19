import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  displayUsd,
  formatUsd,
  formatUsdInput,
  parseUsdAmount,
  readLiveAmountField,
  resolveGiftSpend,
  satsToUsd,
  sendGiftLabel,
  usdToSats
} from './money.ts'

const FIXTURE_RATE = 50
const LIVE_QA_RATE = 37.36

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
    const qaOneCent = usdToSats(0.01, LIVE_QA_RATE)
    const qaTwentyFive = usdToSats(25, LIVE_QA_RATE)
    assert.ok(qaOneCent < 100)
    assert.ok(qaTwentyFive > 60_000)
    assert.notEqual(qaOneCent, qaTwentyFive)
  })

  it('send uses the live Amount field, never a leftover 25', () => {
    const field = readLiveAmountField({
      querySelector: (selector: string) => selector === '#amount' ? { value: '0.01' } : null
    })
    assert.equal(field, '0.01')
    const spend = resolveGiftSpend(field, FIXTURE_RATE)
    const defaultSpend = resolveGiftSpend('25.00', FIXTURE_RATE)
    assert.equal(spend.amountUsd, '0.01')
    assert.equal(spend.amountSats, usdToSats(0.01, FIXTURE_RATE))
    assert.notEqual(spend.amountSats, defaultSpend.amountSats)
    assert.equal(sendGiftLabel('0.01'), 'Send $0.01')
    assert.equal(sendGiftLabel('25.00'), 'Send $25.00')
    assert.throws(() => resolveGiftSpend('', FIXTURE_RATE), /dollars/)
    assert.throws(() => resolveGiftSpend('25.00 leftover ignored', FIXTURE_RATE), /dollars/)
  })
})
