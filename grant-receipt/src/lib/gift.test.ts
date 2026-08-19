import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { giftCreateActionArgs } from './gift.ts'
import { preferOnScreenAmount, readLiveAmountField, resolveGiftSpend, usdToSats } from './money.ts'

const FIXTURE_RATE = 50

function actionForField(rawField: string, controlledState = '') {
  const spend = resolveGiftSpend(rawField, FIXTURE_RATE, controlledState)
  return {
    spend,
    action: giftCreateActionArgs({
      purpose: 'roof repair',
      amountUsd: spend.amountUsd,
      amountSats: spend.amountSats,
      lockingScript: '51',
      giftId: 'gift-qa-1',
      orgIdentityKey: '02' + 'ab'.repeat(32),
      donorIdentityKey: '03' + 'cd'.repeat(32)
    })
  }
}

describe('send gift amount (no live wallet)', () => {
  it('createAction satoshis from field 0.01 are not field 25 sats', () => {
    const oneCent = actionForField('0.01')
    const twentyFive = actionForField('25')
    assert.equal(oneCent.action.outputs[0].satoshis, usdToSats(0.01, FIXTURE_RATE))
    assert.equal(twentyFive.action.outputs[0].satoshis, usdToSats(25, FIXTURE_RATE))
    assert.notEqual(oneCent.action.outputs[0].satoshis, twentyFive.action.outputs[0].satoshis)
    assert.equal(oneCent.action.outputs[0].satoshis, 20_000)
    assert.equal(oneCent.spend.amountUsd, '0.01')
    assert.match(oneCent.action.description, /\$0\.01/)
    assert.equal(oneCent.action.description, 'Gift $0.01: roof repair')
  })

  it('typed 0.01 wins over leftover defaultValue/preview 25', () => {
    const defaultValue = '25.00'
    const preview = '25.00'
    const typed = readLiveAmountField({ value: '0.01' })
    assert.notEqual(typed, defaultValue)
    assert.notEqual(typed, preview)
    assert.equal(preferOnScreenAmount(typed, preview), '0.01')
    const { spend, action } = actionForField(typed, preview)
    assert.equal(spend.amountUsd, '0.01')
    assert.equal(action.outputs[0].satoshis, usdToSats(0.01, FIXTURE_RATE))
    assert.notEqual(action.outputs[0].satoshis, usdToSats(25, FIXTURE_RATE))
    assert.match(action.description, /\$0\.01/)
    assert.equal(action.description.includes('$25'), false)
  })
})
