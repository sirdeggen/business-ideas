import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  displayUsd,
  formatUsd,
  formatUsdInput,
  parseUsdAmount,
  satsToUsd,
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
})
