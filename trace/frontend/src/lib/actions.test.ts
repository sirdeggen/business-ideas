import { describe, expect, it } from 'vitest'
import { FEE_SATS } from '../../../protocol/trace'
import { assertCanRegister } from './actions'

describe('register gates', () => {
  it('requires what, who, and rights', () => {
    expect(assertCanRegister({
      what: '  Dawn lot 12 ',
      who: 'Harbor Co.',
      rights: 'own'
    })).toEqual({
      what: 'Dawn lot 12',
      who: 'Harbor Co.',
      rights: 'own'
    })
    expect(() => assertCanRegister({ what: '', who: 'Harbor Co.', rights: 'own' }))
      .toThrow('Say what this receipt is for.')
    expect(() => assertCanRegister({ what: 'Dawn lot 12', who: '', rights: 'own' }))
      .toThrow('Say who holds the rights.')
    expect(() => assertCanRegister({ what: 'Dawn lot 12', who: 'Harbor Co.', rights: '' }))
      .toThrow('Say what rights this covers.')
  })

  it('uses the small fixed register fee', () => {
    expect(FEE_SATS).toBe(100_000)
  })
})
