import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CHROME_ALLOW_HINT, DECLINED_SPEND, errorMessage, formatWalletError } from './config.ts'

describe('declined spend copy', () => {
  const createActionDenied = {
    call: 'createAction',
    args: {
      description: 'Gift: roof repair',
      outputs: [{ satoshis: 66912 }]
    },
    message: 'Permission denied.'
  }
  const createActionJson = JSON.stringify(createActionDenied)

  it('maps a permission-denied createAction object to the human sentence', () => {
    const mapped = formatWalletError(createActionDenied)
    assert.equal(mapped, DECLINED_SPEND)
    assert.equal(mapped, 'You declined the spend. Nothing was sent.')
    assert.equal(errorMessage(createActionDenied), DECLINED_SPEND)
    assert.equal(mapped.includes('Permission denied'), false)
    assert.equal(mapped.includes('createAction'), false)
    assert.equal(mapped.includes('{'), false)
  })

  it('maps an Error wrapping createAction JSON, not the dump', () => {
    const mapped = errorMessage(new Error(createActionJson))
    assert.equal(mapped, DECLINED_SPEND)
    assert.equal(mapped.includes(createActionJson), false)
    assert.equal(mapped.includes('Permission denied'), false)
    assert.equal(mapped.includes('{'), false)
  })

  it('maps cancelled / user-declined wording the same way', () => {
    assert.equal(errorMessage(new Error('User cancelled the Spending Request.')), DECLINED_SPEND)
    assert.equal(errorMessage(new Error('The request was canceled.')), DECLINED_SPEND)
    assert.equal(errorMessage('user declined'), DECLINED_SPEND)
  })

  it('keeps other wallet errors readable and does not dump objects', () => {
    assert.equal(errorMessage(new Error('Enter an amount in dollars')), 'Enter an amount in dollars')
    assert.equal(errorMessage(new Error('Could not fetch a dollar rate')), 'Could not fetch a dollar rate')
    assert.equal(errorMessage(new Error('Wallet request timed out')), CHROME_ALLOW_HINT)
    assert.equal(errorMessage({ call: 'createAction', args: { outputs: [{ satoshis: 1 }] } }), CHROME_ALLOW_HINT)
    assert.equal(errorMessage({}).includes('{'), false)
  })
})
