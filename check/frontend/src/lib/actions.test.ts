import { describe, expect, it } from 'vitest'
import { DEMO_PRIOR_PAYEE, SEED_FLAGS } from '../../../protocol/check'
import { assertCanCheck, assertCanFile, parseWhole, priorList } from './actions'

describe('check form', () => {
  it('accepts a payee and the default fee before any wallet call', () => {
    expect(parseWhole('10')).toBe(10)
    expect(parseWhole('')).toBeNull()
    expect(priorList(` ${DEMO_PRIOR_PAYEE}\n\n`)).toEqual([DEMO_PRIOR_PAYEE])
    const ready = assertCanCheck({
      payee: DEMO_PRIOR_PAYEE,
      amountSats: 1_000,
      payerRef: 'PO-1',
      priorPayees: [DEMO_PRIOR_PAYEE],
      flags: SEED_FLAGS,
      checkFeeSats: 10,
      reporterShareBps: 5_000,
      firstTimeThresholdSats: 100_000
    })
    expect(ready.payee).toBe(DEMO_PRIOR_PAYEE)
    expect(ready.checkFeeSats).toBe(10)
  })

  it('refuses a blank payee before a wallet exists', () => {
    expect(() => assertCanCheck({
      payee: ' ',
      amountSats: 1,
      payerRef: '',
      priorPayees: [],
      flags: []
    })).toThrow(/payee/i)
  })

  it('files a local flag without a wallet', () => {
    const flag = assertCanFile({
      reporterName: 'Quill Demo Parish',
      subjectKind: 'script',
      subject: 'ee'.repeat(32),
      severity: 'warn',
      note: 'Demo data. A fictional parish filed this script hash.',
      stakeSats: 20
    })
    expect(flag.demo).toBe(false)
    expect(flag.stakeSats).toBe(20)
  })
})
