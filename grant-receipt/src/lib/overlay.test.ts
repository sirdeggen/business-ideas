import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PrivateKey } from '@bsv/sdk'
import { filterReceiptsForGift } from './overlay.ts'
import { DEFAULT_PURPOSE, DEFAULT_PURPOSE_HASH } from './protocol.ts'
import type { CachedPublicReceipt } from './persist.ts'

function announcement(overrides?: Partial<CachedPublicReceipt['receipt']>): CachedPublicReceipt {
  const donor = PrivateKey.fromRandom().toPublicKey().toString()
  const org = PrivateKey.fromRandom().toPublicKey().toString()
  return {
    receipt: {
      v: 1,
      purpose: DEFAULT_PURPOSE,
      purposeHash: DEFAULT_PURPOSE_HASH,
      amountUsd: '25.00',
      amountSats: 50_000_000,
      donorIdentityKey: donor,
      orgIdentityKey: org,
      giftTxid: 'cd'.repeat(32),
      at: '2026-08-18T16:02:00.000Z',
      ...overrides
    },
    signature: [1, 2, 3, 4, 5, 6, 7, 8],
    signingKey: org,
    announceTxid: 'ee'.repeat(32)
  }
}

describe('donor receipt filter (no live overlay)', () => {
  it('keeps the announcement that matches the donor gift', () => {
    const ours = announcement()
    const other = announcement({ giftTxid: 'ff'.repeat(32) })
    const gift = {
      giftTxid: ours.receipt.giftTxid,
      purposeHash: ours.receipt.purposeHash,
      donorIdentityKey: ours.receipt.donorIdentityKey,
      orgIdentityKey: ours.receipt.orgIdentityKey
    }
    const matched = filterReceiptsForGift([ours, other], gift)
    assert.equal(matched.length, 1)
    assert.equal(matched[0].receipt.giftTxid, ours.receipt.giftTxid)
  })

  it('matches the same identity sending a gift to itself', () => {
    const self = PrivateKey.fromRandom().toPublicKey().toString()
    const ours = announcement({
      donorIdentityKey: self,
      orgIdentityKey: self
    })
    const matched = filterReceiptsForGift([ours], {
      giftTxid: ours.receipt.giftTxid,
      purposeHash: ours.receipt.purposeHash,
      donorIdentityKey: self,
      orgIdentityKey: self
    })
    assert.equal(matched.length, 1)
  })
})
