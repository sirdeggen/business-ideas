import { describe, expect, it } from 'vitest'
import { DEFAULT_BOND_SATS, FEE_SATS, MAGIC, SCHEMA_VERSION } from '../../../protocol/vouch'
import { keepLastGoodDesk, mergeVouches, type CachedVouch } from './persist'

function row(vouchId: string, txid: string): CachedVouch {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'vouch',
    vouchId,
    label: 'Harbor steel',
    subject: 'North Mill',
    subjectIdentity: '',
    voucher: `02${'ab'.repeat(32)}`,
    slasher: `02${'ab'.repeat(32)}`,
    bondSats: DEFAULT_BOND_SATS,
    writeFeeSats: FEE_SATS,
    timestamp: '2026-09-15T12:00:00Z',
    txid,
    outputIndex: 1
  }
}

describe('last-good vouch cache', () => {
  it('keeps the last-good vouch when overlay returns empty', () => {
    const cached = { vouches: [row('a1b2c3d4e5f67890', 'aa')], attests: [] }
    expect(keepLastGoodDesk(cached, { vouches: [], attests: [] }, true)).toEqual(cached)
    expect(keepLastGoodDesk(cached, { vouches: [], attests: [] }, false)).toEqual(cached)
    expect(keepLastGoodDesk({ vouches: [], attests: [] }, { vouches: [], attests: [] }, true)).toEqual({
      vouches: [],
      attests: []
    })
  })

  it('merges a live vouch onto last-good instead of replacing the desk', () => {
    const cached = {
      vouches: [row('aaaaaaaaaaaaaaaa', 'aa'), row('bbbbbbbbbbbbbbbb', 'bb')],
      attests: []
    }
    const live = { vouches: [row('aaaaaaaaaaaaaaaa', 'cc')], attests: [] }
    const merged = keepLastGoodDesk(cached, live, false)
    expect(merged.vouches.find((item) => item.vouchId === 'aaaaaaaaaaaaaaaa')?.txid).toBe('cc')
    expect(merged.vouches.find((item) => item.vouchId === 'bbbbbbbbbbbbbbbb')?.txid).toBe('bb')
    expect(mergeVouches(cached.vouches, live.vouches)).toHaveLength(2)
  })
})
