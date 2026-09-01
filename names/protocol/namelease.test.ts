import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  SCHEMA_VERSION,
  assertName,
  decideLease,
  encodeLeaseFields,
  extendExpiry,
  filterNameLeasePayloads,
  isExpired,
  leasePriceSats,
  nameError,
  normalizeName,
  parseNameLeaseFields,
  satsPerDay,
  selectCurrentLease,
  stringToUtf8Bytes,
  type NameLease
} from './namelease'

const LESSEE = `02${'ab'.repeat(32)}`
const OTHER = `03${'cd'.repeat(32)}`

function lease(partial: Partial<NameLease> = {}): NameLease {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    name: 'alice',
    lessee: LESSEE,
    registeredAt: '2026-08-01T00:00:00Z',
    expiresAt: '2026-08-31T00:00:00Z',
    periodDays: 30,
    amountSats: 1200,
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('normalize', () => {
  it('trims and lowercases a name', () => {
    expect(normalizeName('  Alice ')).toBe('alice')
    expect(normalizeName('FOO-BAR')).toBe('foo-bar')
    expect(assertName('Bob-2')).toBe('bob-2')
  })

  it('rejects empty, too long, and illegal characters', () => {
    expect(nameError('')).toBe('Enter a name.')
    expect(nameError('   ')).toBe('Enter a name.')
    expect(nameError('thisnameiswaytoolong')).toBe('That name is too long.')
    expect(nameError('Alice!')).toBe('Use lowercase letters, digits, and hyphen.')
    expect(nameError('-alice')).toBe('A name cannot start or end with a hyphen.')
    expect(nameError('alice-')).toBe('A name cannot start or end with a hyphen.')
    expect(nameError('ok_name')).toBe('Use lowercase letters, digits, and hyphen.')
    expect(nameError('alice')).toBeNull()
    expect(nameError('a')).toBeNull()
    expect(nameError('abcdefghijklmnop')).toBeNull()
  })
})

describe('pricing', () => {
  it('charges more per day for short names', () => {
    expect(satsPerDay('ab')).toBe(100)
    expect(satsPerDay('alice')).toBe(40)
    expect(satsPerDay('somethinglong')).toBe(10)
    expect(leasePriceSats('alice', 90)).toBe(3600)
    expect(leasePriceSats('ab', 30)).toBe(3000)
    expect(leasePriceSats('somethinglong', 365)).toBe(3650)
  })
})

describe('expiry and renew', () => {
  it('treats expiry as free at the instant it ends', () => {
    const expiresAt = '2026-08-31T00:00:00Z'
    expect(isExpired(expiresAt, new Date('2026-08-30T23:59:59Z'))).toBe(false)
    expect(isExpired(expiresAt, new Date('2026-08-31T00:00:00Z'))).toBe(true)
    expect(isExpired(expiresAt, new Date('2026-09-01T00:00:00Z'))).toBe(true)
  })

  it('extends a live lease from the current expiry, not from now', () => {
    const now = new Date('2026-08-10T00:00:00Z')
    expect(extendExpiry('2026-08-31T00:00:00Z', 30, now)).toBe('2026-09-30T00:00:00Z')
    expect(extendExpiry('2026-08-31T00:00:00Z', 90, now)).toBe('2026-11-29T00:00:00Z')
  })

  it('starts a new clock from now when the lease has already ended', () => {
    const now = new Date('2026-09-02T00:00:00Z')
    expect(extendExpiry('2026-08-31T00:00:00Z', 30, now)).toBe('2026-10-02T00:00:00Z')
    expect(extendExpiry(null, 30, now)).toBe('2026-10-02T00:00:00Z')
  })
})

describe('conflict', () => {
  it('blocks register while another lessee still holds the name', () => {
    const now = new Date('2026-08-15T00:00:00Z')
    const current = lease()
    expect(decideLease({ current, lessee: OTHER, now })).toEqual({
      ok: false,
      reason: 'That name is leased.'
    })
    expect(selectCurrentLease([current], 'alice', now)?.lessee).toBe(LESSEE)
  })

  it('lets the same lessee renew while unexpired', () => {
    const now = new Date('2026-08-15T00:00:00Z')
    const current = lease()
    expect(decideLease({ current, lessee: LESSEE, now })).toEqual({
      ok: true,
      kind: 'renew',
      previousExpiry: current.expiresAt
    })
  })

  it('frees the name after expiry so anyone can register', () => {
    const now = new Date('2026-09-01T00:00:00Z')
    const current = lease()
    expect(decideLease({ current, lessee: OTHER, now })).toEqual({
      ok: true,
      kind: 'register'
    })
    expect(selectCurrentLease([current], 'alice', now)).toBeNull()
  })

  it('picks the latest unexpired lease for a name', () => {
    const now = new Date('2026-08-20T00:00:00Z')
    const first = lease({ expiresAt: '2026-08-31T00:00:00Z', registeredAt: '2026-08-01T00:00:00Z' })
    const renewed = lease({
      kind: 'renew',
      expiresAt: '2026-09-30T00:00:00Z',
      registeredAt: '2026-08-20T00:00:00Z',
      previousExpiry: first.expiresAt
    })
    expect(selectCurrentLease([first, renewed], 'ALICE', now)?.expiresAt).toBe('2026-09-30T00:00:00Z')
  })
})

describe('encode / parse', () => {
  it('round-trips a register and a renew', () => {
    const registered = lease()
    const fields = encodeLeaseFields(registered)
    expect(fieldTexts(fields)).toEqual([
      MAGIC,
      SCHEMA_VERSION,
      'register',
      'alice',
      LESSEE,
      registered.registeredAt,
      registered.expiresAt,
      '30',
      '1200'
    ])
    expect(parseNameLeaseFields(fields)).toEqual(registered)

    const renewed = lease({
      kind: 'renew',
      previousExpiry: '2026-08-31T00:00:00Z',
      expiresAt: '2026-09-30T00:00:00Z'
    })
    const parsed = parseNameLeaseFields(encodeLeaseFields(renewed))
    expect(parsed).toEqual(renewed)
  })

  it('finds MAGIC among lock padding and drops foreign protocols', () => {
    const registered = lease()
    const padded = [
      new Uint8Array([2, ...new Uint8Array(32)]),
      ...encodeLeaseFields(registered)
    ]
    expect(parseNameLeaseFields(padded)).toEqual(registered)
    expect(parseNameLeaseFields([stringToUtf8Bytes('dataset'), stringToUtf8Bytes('1')])).toBeNull()
    expect(filterNameLeasePayloads([
      { ...registered, magic: 'dataset' as typeof MAGIC },
      registered
    ])).toEqual([registered])
  })
})
