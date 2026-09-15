import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  PROTOCOL_FEE_BPS,
  SCHEMA_VERSION,
  canConfirm,
  canFund,
  canRelease,
  encodeConfirmFields,
  encodeFundFields,
  encodeListFields,
  encodeReleaseFields,
  isBuyer,
  isSeller,
  listingStatus,
  parseHandoffFields,
  protocolFeeSats,
  sellerPayoutSats,
  sheetTitle,
  type HandoffList
} from '../../../protocol/handoff'

const SELLER = `02${'ab'.repeat(32)}`
const BUYER = `03${'cd'.repeat(32)}`
const LISTING_ID = 'a'.repeat(32)

function list(overrides: Partial<HandoffList> = {}): HandoffList {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'list',
    listingId: LISTING_ID,
    title: 'Repo access',
    assetType: 'repo',
    description: 'Intent to transfer repo access.',
    priceSats: 100_000,
    sellerIdentity: SELLER,
    createdAt: '2026-09-01T12:00:00Z',
    ...overrides
  }
}

describe('handoff state', () => {
  it('moves listed → funded → confirmed → released', () => {
    expect(listingStatus({})).toBeNull()
    expect(listingStatus({ list: true })).toBe('listed')
    expect(listingStatus({ list: true, fund: true })).toBe('funded')
    expect(listingStatus({ list: true, fund: true, sellerConfirm: true })).toBe('seller_confirmed')
    expect(listingStatus({ list: true, fund: true, buyerConfirm: true })).toBe('buyer_confirmed')
    expect(listingStatus({
      list: true, fund: true, sellerConfirm: true, buyerConfirm: true
    })).toBe('confirmed')
    expect(listingStatus({
      list: true, fund: true, sellerConfirm: true, buyerConfirm: true, release: true
    })).toBe('released')
    expect(canFund('listed')).toBe(true)
    expect(canFund('funded')).toBe(false)
    expect(canConfirm('funded')).toBe(true)
    expect(canConfirm('seller_confirmed')).toBe(true)
    expect(canConfirm('confirmed')).toBe(false)
    expect(canRelease('confirmed')).toBe(true)
    expect(canRelease('funded')).toBe(false)
  })

  it('titles the desk from the next job action', () => {
    expect(sheetTitle(null)).toBe('Handoff Desk')
    expect(sheetTitle('listed')).toBe('Handoff Desk')
    expect(sheetTitle('funded')).toBe('Confirm')
    expect(sheetTitle('confirmed')).toBe('Release')
    expect(sheetTitle('released')).toBe('Released')
  })

  it('gates seller and buyer by identity', () => {
    const row = list()
    expect(isSeller(row, SELLER)).toBe(true)
    expect(isSeller(row, BUYER)).toBe(false)
    expect(isBuyer({ buyerIdentity: BUYER }, BUYER)).toBe(true)
    expect(isBuyer({ buyerIdentity: BUYER }, SELLER)).toBe(false)
  })
})

describe('protocol fee story', () => {
  it('is about 1% and deducts from the seller payout', () => {
    expect(PROTOCOL_FEE_BPS).toBe(100)
    expect(protocolFeeSats(100_000)).toBe(1000)
    expect(sellerPayoutSats(100_000)).toBe(99_000)
    expect(protocolFeeSats(1)).toBe(0)
    expect(sellerPayoutSats(1)).toBe(1)
  })
})

describe('encode / decode', () => {
  it('round-trips list, fund, confirm, and release', () => {
    const written = list()
    expect(parseHandoffFields(encodeListFields(written))).toEqual(written)
    expect(parseHandoffFields(encodeFundFields({
      listingId: LISTING_ID,
      buyerIdentity: BUYER,
      amountSats: 100_000,
      fundedAt: '2026-09-01T13:00:00Z'
    }))).toMatchObject({ kind: 'fund', buyerIdentity: BUYER })
    expect(parseHandoffFields(encodeConfirmFields({
      listingId: LISTING_ID,
      party: 'seller',
      identity: SELLER,
      confirmedAt: '2026-09-01T14:00:00Z'
    }))).toMatchObject({ kind: 'confirm', party: 'seller' })
    expect(parseHandoffFields(encodeReleaseFields({
      listingId: LISTING_ID,
      sellerIdentity: SELLER,
      buyerIdentity: BUYER,
      sellerSats: 99_000,
      feeSats: 1000,
      releasedAt: '2026-09-01T15:00:00Z'
    }))).toMatchObject({ kind: 'release', feeSats: 1000 })
  })

  it('keeps MAGIC handoff at least five characters', () => {
    expect(MAGIC.length).toBeGreaterThanOrEqual(5)
    expect(MAGIC).toBe('handoff')
  })

  it('does not treat a missing MAGIC as a handoff', () => {
    expect(parseHandoffFields([
      Array.from(new TextEncoder().encode('jobescrow'))
    ])).toBeNull()
    expect(parseHandoffFields([
      Array.from(new TextEncoder().encode('vault'))
    ])).toBeNull()
  })
})
