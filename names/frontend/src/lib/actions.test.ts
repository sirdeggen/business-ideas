import { describe, expect, it } from 'vitest'
import { decideLease, leasePriceSats } from '../../../protocol/namelease'
import { assertCanLease } from './actions'
import { MAGIC, SCHEMA_VERSION } from '../../../protocol/namelease'
import type { OverlayLease } from './overlay'

const LESSEE = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`

function current(partial: Partial<OverlayLease> = {}): OverlayLease {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    name: 'alice',
    lessee: OTHER,
    registeredAt: '2026-08-01T00:00:00Z',
    expiresAt: '2026-08-31T00:00:00Z',
    periodDays: 30,
    amountSats: 1200,
    txid: 'aa',
    outputIndex: 1,
    ...partial
  }
}

describe('register / renew gates', () => {
  it('requires a normalized name and a listed period', () => {
    expect(assertCanLease({ name: 'Alice', periodDays: 90 })).toEqual({
      name: 'alice',
      periodDays: 90
    })
    expect(() => assertCanLease({ name: '', periodDays: 90 })).toThrow('Enter a name.')
    expect(() => assertCanLease({ name: 'alice', periodDays: 14 })).toThrow('Pick 30, 90, or 365 days.')
  })

  it('blocks register while leased and lets the holder renew', () => {
    const now = new Date('2026-08-15T00:00:00Z')
    expect(decideLease({ current: current(), lessee: LESSEE, now }).ok).toBe(false)
    expect(decideLease({ current: current({ lessee: LESSEE }), lessee: LESSEE, now })).toMatchObject({
      ok: true,
      kind: 'renew'
    })
    expect(decideLease({
      current: current({ expiresAt: '2026-08-01T00:00:00Z' }),
      lessee: LESSEE,
      now
    })).toEqual({ ok: true, kind: 'register' })
  })

  it('prices from the sat schedule, not an ENS dollar rate', () => {
    expect(leasePriceSats('alice', 90)).toBe(3600)
    expect(leasePriceSats('ab', 365)).toBe(36500)
  })
})
