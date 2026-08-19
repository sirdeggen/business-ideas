import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { giftCreateActionArgs } from './gift.ts'
import { readLiveAmountField, resolveGiftSpend, usdToSats } from './money.ts'

const FIXTURE_RATE = 50

describe('send gift amount (no live wallet)', () => {
  it('createAction satoshis come from the Amount field, not the 25 default', () => {
    const staleState = '25.00'
    const field = readLiveAmountField({ value: '0.01' })
    assert.notEqual(field, staleState)
    const spend = resolveGiftSpend(field, FIXTURE_RATE)
    const action = giftCreateActionArgs({
      purpose: 'roof repair',
      amountSats: spend.amountSats,
      lockingScript: '51',
      giftId: 'gift-qa-1',
      orgIdentityKey: '02' + 'ab'.repeat(32),
      donorIdentityKey: '03' + 'cd'.repeat(32)
    })
    assert.equal(action.outputs[0].satoshis, usdToSats(0.01, FIXTURE_RATE))
    assert.notEqual(action.outputs[0].satoshis, usdToSats(25, FIXTURE_RATE))
    assert.equal(spend.amountUsd, '0.01')
    assert.equal(action.outputs[0].satoshis, 20_000)
  })
})
