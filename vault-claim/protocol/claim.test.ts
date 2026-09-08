import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  SCHEMA_VERSION,
  TRANSFER_SATS,
  currentClaims,
  encodeClaimFields,
  encodeRedeemFields,
  formatSats,
  isHolder,
  liveSerialTaken,
  makeClaimId,
  parseClaimFields,
  resolveItemHash,
  validatePrice,
  type ClaimRedeem,
  type ClaimToken
} from './claim'

const ISSUER = `02${'ab'.repeat(32)}`
const HOLDER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`
const SERIAL = 'PSA 9.5 · 25-0147'

function claim(partial: Partial<ClaimToken> = {}): ClaimToken {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'claim',
    claimId: makeClaimId(ISSUER, SERIAL, '2026-09-01T10:00:00Z', 'aa'),
    label: 'Jordan 1986 Fleer',
    itemSerial: SERIAL,
    itemHash: resolveItemHash('slab photo'),
    holder: ISSUER,
    issuer: ISSUER,
    priceSats: 100,
    timestamp: '2026-09-01T10:00:00Z',
    ...partial
  }
}

function redeemed(partial: Partial<ClaimRedeem> = {}): ClaimRedeem {
  const row = claim()
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'redeem',
    claimId: row.claimId,
    holder: ISSUER,
    itemSerial: row.itemSerial,
    itemHash: row.itemHash,
    timestamp: '2026-09-01T12:00:00Z',
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('vault claim protocol', () => {
  it('round-trips a claim bound to one serial', () => {
    const item = claim()
    const fields = encodeClaimFields(item)
    expect(fieldTexts(fields)).toEqual([
      MAGIC,
      SCHEMA_VERSION,
      'claim',
      item.claimId,
      item.label,
      item.itemSerial,
      item.itemHash,
      item.holder,
      item.issuer,
      String(item.priceSats),
      item.timestamp
    ])
    expect(fieldTexts(fields)).toContain(SERIAL)
    expect(fieldTexts(fields).join('\n')).not.toMatch(/gacha|pack|random/i)
    const parsed = parseClaimFields(fields)
    expect(parsed).toEqual(item)
  })

  it('still parses when extra fields sit before MAGIC', () => {
    const item = claim()
    const extra = [Array.from(new TextEncoder().encode('pubkey'))]
    expect(parseClaimFields([...extra, ...encodeClaimFields(item)])).toEqual(item)
  })

  it('round-trips a redeem and drops the burned claim from the live list', () => {
    const first = claim()
    const moved = claim({
      holder: HOLDER,
      timestamp: '2026-09-01T11:00:00Z'
    })
    const other = claim({
      claimId: makeClaimId(OTHER, 'BOX-9', '2026-09-01T09:00:00Z', 'bb'),
      label: 'Other slab',
      itemSerial: 'BOX-9',
      holder: OTHER,
      issuer: OTHER,
      timestamp: '2026-09-01T09:00:00Z'
    })
    const burn = redeemed()
    const parsed = parseClaimFields(encodeRedeemFields(burn))
    expect(parsed).toEqual(burn)
    const live = currentClaims([first, moved, other], [burn])
    expect(live).toHaveLength(1)
    expect(live[0]?.claimId).toBe(other.claimId)
    expect(isHolder(moved, HOLDER)).toBe(true)
    expect(isHolder(moved, ISSUER)).toBe(false)
  })

  it('keeps the current holder as the latest unredeemed claim', () => {
    const first = claim()
    const moved = claim({
      holder: HOLDER,
      timestamp: '2026-09-01T11:00:00Z'
    })
    const live = currentClaims([first, moved])
    expect(live).toHaveLength(1)
    expect(live[0]?.holder).toBe(HOLDER)
  })

  it('hashes an optional note and accepts a 64-hex item hash or empty', () => {
    const hashed = resolveItemHash('slab photo')
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
    expect(resolveItemHash(hashed)).toBe(hashed)
    expect(resolveItemHash(`0x${hashed}`)).toBe(hashed)
    expect(resolveItemHash('')).toBe('')
    expect(resolveItemHash('   ')).toBe('')
  })

  it('rejects a zero-sat price and formats sats without dollars', () => {
    expect(validatePrice(0)).toBe('price must be at least 1 sat')
    expect(validatePrice(1.5)).toBe('price must be a whole number of sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(100)).toBe('100 sats')
    expect(formatSats(100)).not.toMatch(/\$/)
    expect(TRANSFER_SATS).toBe(1)
  })

  it('rejects an empty label or serial', () => {
    expect(parseClaimFields(encodeClaimFields(claim({ label: '' })))).toBeNull()
    expect(parseClaimFields(encodeClaimFields(claim({ itemSerial: '' })))).toBeNull()
  })

  it('treats one live serial from the same issuer as taken', () => {
    const row = claim()
    expect(liveSerialTaken([row], ISSUER, SERIAL)).toBe(true)
    expect(liveSerialTaken([row], ISSUER, SERIAL, row.claimId)).toBe(false)
    expect(liveSerialTaken([row], ISSUER, 'OTHER-1')).toBe(false)
    expect(liveSerialTaken([row], OTHER, SERIAL)).toBe(false)
  })
})
