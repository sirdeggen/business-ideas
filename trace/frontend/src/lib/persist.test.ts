import { describe, expect, it } from 'vitest'
import { FEE_SATS, MAGIC, SCHEMA_VERSION } from '../../../protocol/trace'
import { keepLastGoodReceipts, mergeReceipts, type CachedReceipt } from './persist'

function row(token: string, txid: string): CachedReceipt {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    token,
    what: 'Dawn lot 12',
    who: 'Harbor Co.',
    rights: 'own',
    feePaid: FEE_SATS,
    timestamp: '2026-09-08T12:00:00Z',
    txid,
    outputIndex: 1
  }
}

describe('last-good receipt cache', () => {
  it('keeps the last-good receipt when overlay returns empty', () => {
    const cached = [row('a1b2c3d4e5f67890', 'aa')]
    expect(keepLastGoodReceipts(cached, [], true)).toEqual(cached)
    expect(keepLastGoodReceipts(cached, [], false)).toEqual(cached)
    expect(keepLastGoodReceipts([], [], true)).toEqual([])
  })

  it('merges a live receipt onto last-good instead of replacing the desk', () => {
    const cached = [row('aaaaaaaaaaaaaaaa', 'aa'), row('bbbbbbbbbbbbbbbb', 'bb')]
    const live = [row('aaaaaaaaaaaaaaaa', 'cc')]
    const merged = keepLastGoodReceipts(cached, live, false)
    expect(merged.find((item) => item.token === 'aaaaaaaaaaaaaaaa')?.txid).toBe('cc')
    expect(merged.find((item) => item.token === 'bbbbbbbbbbbbbbbb')?.txid).toBe('bb')
    expect(mergeReceipts(cached, live)).toHaveLength(2)
  })
})
