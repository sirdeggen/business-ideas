import { describe, expect, it } from 'vitest'
import { MAGIC, SCHEMA_VERSION } from '../../../protocol/namelease'
import { keepLastGoodLeases, mergeLeases, type CachedLease } from './persist'

function lease(name: string, txid: string): CachedLease {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    name,
    lessee: `02${'ab'.repeat(32)}`,
    registeredAt: '2026-08-01T00:00:00Z',
    expiresAt: '2026-08-31T00:00:00Z',
    periodDays: 30,
    amountSats: 1200,
    txid,
    outputIndex: 1
  }
}

describe('last-good lease cache', () => {
  it('keeps the last-good lease when overlay returns empty', () => {
    const cached = [lease('alice', 'aa')]
    expect(keepLastGoodLeases(cached, [], true)).toEqual(cached)
    expect(keepLastGoodLeases(cached, [], false)).toEqual(cached)
    expect(keepLastGoodLeases([], [], true)).toEqual([])
  })

  it('merges a live lease onto last-good instead of replacing the desk', () => {
    const cached = [lease('alice', 'aa'), lease('bob', 'bb')]
    const live = [lease('alice', 'cc')]
    const merged = keepLastGoodLeases(cached, live, false)
    expect(merged.find((row) => row.name === 'alice')?.txid).toBe('cc')
    expect(merged.find((row) => row.name === 'bob')?.txid).toBe('bb')
    expect(mergeLeases(cached, live)).toHaveLength(2)
  })
})
