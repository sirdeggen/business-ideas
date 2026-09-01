import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  SCHEMA_VERSION,
  encodeDefFields,
  encodeKeyFields,
  expiresAtFrom,
  isKeyValid,
  keyStatus,
  latestKey,
  parseMembershipFields,
  renewExpiry,
  selectShowKey,
  sheetTitle,
  type MembershipDef,
  type MembershipKey
} from '../../../protocol/membership'

const ISSUER = `02${'ab'.repeat(32)}`
const MEMBER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`
const MEMBERSHIP_ID = 'a'.repeat(32)

function def(overrides: Partial<MembershipDef> = {}): MembershipDef {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'def',
    membershipId: MEMBERSHIP_ID,
    name: 'Gym month',
    durationSec: 30 * 86_400,
    priceSats: 50_000,
    issuerIdentity: ISSUER,
    createdAt: '2026-09-01T12:00:00Z',
    ...overrides
  }
}

function key(overrides: Partial<MembershipKey> = {}): MembershipKey {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'key',
    membershipId: MEMBERSHIP_ID,
    memberIdentity: MEMBER,
    issuedAt: '2026-09-01T12:00:00Z',
    durationSec: 30 * 86_400,
    expiresAt: '2026-10-01T12:00:00Z',
    issuerIdentity: ISSUER,
    ...overrides
  }
}

describe('expiry pass / fail', () => {
  it('is valid before expiry and expired at and after expiry', () => {
    const live = key({ expiresAt: '2026-10-01T12:00:00Z' })
    expect(isKeyValid(live, Date.parse('2026-09-15T12:00:00Z'))).toBe(true)
    expect(keyStatus(live, Date.parse('2026-09-15T12:00:00Z'))).toBe('valid')
    expect(isKeyValid(live, Date.parse('2026-10-01T12:00:00Z'))).toBe(false)
    expect(keyStatus(live, Date.parse('2026-10-01T12:00:00.000Z'))).toBe('expired')
    expect(isKeyValid(live, Date.parse('2026-10-02T00:00:00Z'))).toBe(false)
  })

  it('computes issuedAt + duration as expiresAt', () => {
    expect(expiresAtFrom('2026-09-01T12:00:00Z', 60)).toBe('2026-09-01T12:01:00Z')
    expect(expiresAtFrom('2026-09-01T12:00:00Z', 30 * 86_400)).toBe('2026-10-01T12:00:00Z')
  })
})

describe('renew extends', () => {
  it('adds duration onto the previous expiry when the key is still good', () => {
    expect(renewExpiry('2026-10-01T12:00:00Z', 30 * 86_400, Date.parse('2026-09-15T12:00:00Z')))
      .toBe('2026-10-31T12:00:00Z')
  })

  it('extends from now when the previous key already expired', () => {
    expect(renewExpiry('2026-08-01T12:00:00Z', 60, Date.parse('2026-09-01T12:00:00Z')))
      .toBe('2026-09-01T12:01:00Z')
  })

  it('picks the later key for the same member after a renew', () => {
    const first = { ...key({ issuedAt: '2026-09-01T12:00:00Z', expiresAt: '2026-09-01T12:01:00Z' }), txid: 'aa'.repeat(32) }
    const renewed = { ...key({ issuedAt: '2026-09-01T12:01:00Z', expiresAt: '2026-09-01T12:02:00Z' }), txid: 'bb'.repeat(32) }
    const other = { ...key({ memberIdentity: OTHER, issuedAt: '2026-09-01T12:03:00Z', expiresAt: '2026-09-01T12:04:00Z' }), txid: 'cc'.repeat(32) }
    expect(selectShowKey([first, renewed, other], first.txid)?.txid).toBe(renewed.txid)
    expect(latestKey([first, renewed])?.expiresAt).toBe(renewed.expiresAt)
  })
})

describe('sheet titles', () => {
  it('is Membership until a key exists, Show while valid, Renew after expiry', () => {
    expect(sheetTitle({ membership: false, key: false, valid: false })).toBe('Membership')
    expect(sheetTitle({ membership: true, key: false, valid: false })).toBe('Membership')
    expect(sheetTitle({ membership: true, key: true, valid: true })).toBe('Show')
    expect(sheetTitle({ membership: true, key: true, valid: false })).toBe('Renew')
  })
})

describe('encode / decode', () => {
  it('round-trips a membership definition and a timed key', () => {
    const written = def()
    expect(parseMembershipFields(encodeDefFields(written))).toEqual(written)
    const held = key()
    expect(parseMembershipFields(encodeKeyFields(held))).toEqual(held)
  })

  it('keeps the protocol string at least five characters', () => {
    expect(MAGIC.length).toBeGreaterThanOrEqual(5)
    expect(MAGIC).toBe('membership')
  })

  it('does not treat a missing MAGIC as a membership', () => {
    expect(parseMembershipFields([
      Array.from(new TextEncoder().encode('ticket'))
    ])).toBeNull()
  })
})
