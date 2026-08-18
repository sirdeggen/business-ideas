import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PrivateKey } from '@bsv/sdk'
import { keepLastGoodGifts, mergeGiftNotices } from './persist.ts'
import { DEFAULT_PURPOSE, DEFAULT_PURPOSE_HASH, type GiftNotice } from './protocol.ts'

function giftNotice(giftId: string, org = PrivateKey.fromRandom().toPublicKey().toString()): GiftNotice {
  return {
    v: 1,
    kind: 'gift',
    giftId,
    purpose: DEFAULT_PURPOSE,
    purposeHash: DEFAULT_PURPOSE_HASH,
    amountUsd: '25.00',
    amountSats: 50_000_000,
    donorIdentityKey: PrivateKey.fromRandom().toPublicKey().toString(),
    orgIdentityKey: org,
    giftTxid: 'ab'.repeat(32),
    keyID: giftId,
    donorName: 'Ada',
    at: '2026-08-18T16:00:00.000Z'
  }
}

describe('last-good incoming gifts', () => {
  it('keeps the cached list when ls_anytx is empty or failed', () => {
    const cached = [giftNotice('seen-1')]
    assert.equal(keepLastGoodGifts(cached, [], true).length, 1)
    assert.equal(keepLastGoodGifts(cached, [], false)[0].giftId, 'seen-1')
    assert.equal(keepLastGoodGifts([], [], true).length, 0)
  })

  it('merges a live page onto last-good instead of replacing it', () => {
    const cached = [giftNotice('seen-1')]
    const live = [giftNotice('seen-2')]
    const kept = keepLastGoodGifts(cached, live, false)
    assert.deepEqual(kept.map((row) => row.giftId).sort(), ['seen-1', 'seen-2'])
    const merged = mergeGiftNotices(cached, [giftNotice('seen-1')])
    assert.equal(merged.length, 1)
  })
})
