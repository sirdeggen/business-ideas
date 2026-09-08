import { describe, expect, it } from 'vitest'
import {
  CLAIM_SATS,
  MAGIC,
  SCHEMA_VERSION,
  TRANSFER_SATS,
  currentVaultClaims,
  encodeClaimFields,
  encodeRedeemFields,
  formatSats,
  isHolder,
  makeClaimId,
  makeRequestId,
  parseClaimFields,
  resolveSampleHash,
  validatePrice,
  type ClaimToken,
  type RedeemReceipt
} from './claim'

const ISSUER = `02${'ab'.repeat(32)}`
const HOLDER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`
const PHOTO = 'Photo of Charizard 4/102, PSA slab 8\n'

function claim(partial: Partial<ClaimToken> = {}): ClaimToken {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'claim',
    claimId: makeClaimId(ISSUER, 'Charizard 4/102', 'PSA-81234567', '2026-09-01T10:00:00Z', 'aa'),
    label: 'Charizard 4/102',
    itemId: 'PSA-81234567',
    sampleHash: resolveSampleHash(PHOTO),
    holder: ISSUER,
    issuer: ISSUER,
    priceSats: 100,
    timestamp: '2026-09-01T10:00:00Z',
    ...partial
  }
}

function redeemed(partial: Partial<RedeemReceipt> = {}): RedeemReceipt {
  const row = claim()
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'redeem',
    claimId: row.claimId,
    label: row.label,
    itemId: row.itemId,
    holder: ISSUER,
    requestId: makeRequestId(row.claimId, ISSUER, '2026-09-01T12:00:00Z', 'cc'),
    shipTo: 'Courtyard window 3',
    timestamp: '2026-09-01T12:00:00Z',
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('vault claim protocol', () => {
  it('round-trips a claim without photo bytes', () => {
    const item = claim()
    const fields = encodeClaimFields(item)
    expect(fieldTexts(fields)).toEqual([
      MAGIC,
      SCHEMA_VERSION,
      'claim',
      item.claimId,
      item.label,
      item.itemId,
      item.sampleHash,
      item.holder,
      item.issuer,
      String(item.priceSats),
      item.timestamp
    ])
    expect(fieldTexts(fields)).not.toContain(PHOTO)
    expect(fieldTexts(fields).join('\n')).not.toContain('PSA slab')
    const parsed = parseClaimFields(fields)
    expect(parsed).toEqual(item)
  })

  it('still parses when extra fields sit before MAGIC', () => {
    const item = claim()
    const extra = [Array.from(new TextEncoder().encode('pubkey'))]
    expect(parseClaimFields([...extra, ...encodeClaimFields(item)])).toEqual(item)
  })

  it('round-trips a redeem receipt', () => {
    const item = redeemed()
    const parsed = parseClaimFields(encodeRedeemFields(item))
    expect(parsed).toEqual(item)
  })

  it('hashes pasted bytes, accepts a 64-hex sample hash, and allows empty', () => {
    const hashed = resolveSampleHash(PHOTO)
    expect(hashed).toMatch(/^[0-9a-f]{64}$/)
    expect(resolveSampleHash(hashed)).toBe(hashed)
    expect(resolveSampleHash(`0x${hashed}`)).toBe(hashed)
    expect(resolveSampleHash('')).toBe('')
    expect(parseClaimFields(encodeClaimFields(claim({ sampleHash: '' })))).toMatchObject({
      sampleHash: ''
    })
  })

  it('keeps the current holder and marks a burned claim redeemed', () => {
    const first = claim()
    const moved = claim({
      holder: HOLDER,
      timestamp: '2026-09-01T11:00:00Z'
    })
    const other = claim({
      claimId: makeClaimId(OTHER, 'Other card', 'SN-9', '2026-09-01T09:00:00Z', 'bb'),
      label: 'Other card',
      itemId: 'SN-9',
      holder: OTHER,
      issuer: OTHER,
      timestamp: '2026-09-01T09:00:00Z'
    })
    const burn = redeemed({ holder: HOLDER, timestamp: '2026-09-01T12:00:00Z' })
    const live = currentVaultClaims([first, moved, other], [burn])
    expect(live).toHaveLength(2)
    const charizard = live.find((row) => row.claimId === first.claimId)
    expect(charizard?.status).toBe('redeemed')
    expect(charizard?.holder).toBe(HOLDER)
    expect(charizard?.shipTo).toBe('Courtyard window 3')
    expect(live.find((row) => row.claimId === other.claimId)?.status).toBe('held')
    expect(isHolder(moved, HOLDER)).toBe(true)
    expect(isHolder(moved, ISSUER)).toBe(false)
  })

  it('still lists a redeemed claim when the spent token is gone', () => {
    const burn = redeemed()
    const live = currentVaultClaims([], [burn])
    expect(live).toHaveLength(1)
    expect(live[0]?.status).toBe('redeemed')
    expect(live[0]?.label).toBe('Charizard 4/102')
    expect(live[0]?.requestId).toBe(burn.requestId)
  })

  it('allows a zero price for a non-sale claim and formats sats without dollars', () => {
    expect(validatePrice(0)).toBeNull()
    expect(validatePrice(-1)).toBe('price cannot be negative')
    expect(validatePrice(1.5)).toBe('price must be a whole number of sats')
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(100)).toBe('100 sats')
    expect(formatSats(100)).not.toMatch(/\$/)
    expect(CLAIM_SATS).toBe(1)
    expect(TRANSFER_SATS).toBe(1)
    expect(parseClaimFields(encodeClaimFields(claim({ priceSats: 0 })))).toMatchObject({
      priceSats: 0
    })
  })

  it('rejects an empty label or item id', () => {
    expect(parseClaimFields(encodeClaimFields(claim({ label: '' })))).toBeNull()
    expect(parseClaimFields(encodeClaimFields(claim({ itemId: '' })))).toBeNull()
  })
})
