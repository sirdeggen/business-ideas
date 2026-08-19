import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { PrivateKey } from '@bsv/sdk'
import {
  applyDonorUpdates,
  applyEvent,
  applyMessages,
  applyReceiptAnnouncement,
  giftFromNotice,
  mergeIncomingGifts,
  pendingAcks,
  pendingReceipts,
  issuedReceipts
} from './machine.ts'
import {
  DEFAULT_PURPOSE,
  DEFAULT_PURPOSE_HASH,
  type AckNotice,
  type GiftNotice,
  type ReceiptNotice
} from './protocol.ts'

function giftNotice(overrides?: Partial<GiftNotice>): GiftNotice {
  return {
    v: 1,
    kind: 'gift',
    giftId: 'gift-1',
    purpose: DEFAULT_PURPOSE,
    purposeHash: DEFAULT_PURPOSE_HASH,
    amountUsd: '25.00',
    amountSats: 50_000_000,
    donorIdentityKey: PrivateKey.fromRandom().toPublicKey().toString(),
    orgIdentityKey: PrivateKey.fromRandom().toPublicKey().toString(),
    giftTxid: 'cd'.repeat(32),
    keyID: 'gift-1',
    at: '2026-08-18T16:00:00.000Z',
    ...overrides
  }
}

describe('gift → ack → receipt state machine', () => {
  it('walks gifted → acknowledged → receipted', () => {
    const gift = giftNotice()
    const gifted = applyEvent([], { type: 'gift', gift })
    assert.equal(gifted[0].status, 'gifted')
    assert.equal(pendingAcks(gifted).length, 1)

    const ack: AckNotice = {
      v: 1,
      kind: 'ack',
      giftId: gift.giftId,
      purposeHash: gift.purposeHash,
      orgIdentityKey: gift.orgIdentityKey,
      donorIdentityKey: gift.donorIdentityKey,
      giftTxid: gift.giftTxid,
      at: '2026-08-18T16:01:00.000Z'
    }
    const acknowledged = applyEvent(gifted, { type: 'ack', ack })
    assert.equal(acknowledged[0].status, 'acknowledged')
    assert.equal(pendingReceipts(acknowledged).length, 1)

    const receiptNotice: ReceiptNotice = {
      v: 1,
      kind: 'receipt',
      giftId: gift.giftId,
      receipt: {
        v: 1,
        purpose: gift.purpose,
        purposeHash: gift.purposeHash,
        amountUsd: gift.amountUsd,
        amountSats: gift.amountSats,
        donorIdentityKey: gift.donorIdentityKey,
        orgIdentityKey: gift.orgIdentityKey,
        giftTxid: gift.giftTxid,
        at: '2026-08-18T16:02:00.000Z'
      },
      signature: [1, 2, 3, 4],
      at: '2026-08-18T16:02:00.000Z'
    }
    const receipted = applyEvent(acknowledged, { type: 'receipt', receipt: receiptNotice })
    assert.equal(receipted[0].status, 'receipted')
    assert.equal(issuedReceipts(receipted).length, 1)
    assert.equal(receipted[0].receipt?.purposeHash, DEFAULT_PURPOSE_HASH)
  })

  it('applies the three messages in order without a live inbox', () => {
    const gift = giftNotice()
    const next = applyMessages([], [
      gift,
      {
        v: 1,
        kind: 'ack',
        giftId: gift.giftId,
        purposeHash: gift.purposeHash,
        orgIdentityKey: gift.orgIdentityKey,
        donorIdentityKey: gift.donorIdentityKey,
        giftTxid: gift.giftTxid,
        at: '2026-08-18T16:01:00.000Z'
      },
      {
        v: 1,
        kind: 'receipt',
        giftId: gift.giftId,
        receipt: {
          v: 1,
          purpose: gift.purpose,
          purposeHash: gift.purposeHash,
          amountUsd: gift.amountUsd,
          amountSats: gift.amountSats,
          donorIdentityKey: gift.donorIdentityKey,
          orgIdentityKey: gift.orgIdentityKey,
          giftTxid: gift.giftTxid,
          at: '2026-08-18T16:02:00.000Z'
        },
        signature: [9, 8, 7, 6],
        at: '2026-08-18T16:02:00.000Z'
      }
    ])
    assert.equal(next[0].status, 'receipted')
  })

  it('applies a receipt announcement to a gifted row', () => {
    const gift = giftNotice()
    const gifted = [giftFromNotice(gift)]
    const announcement = {
      receipt: {
        v: 1 as const,
        purpose: gift.purpose,
        purposeHash: gift.purposeHash,
        amountUsd: gift.amountUsd,
        amountSats: gift.amountSats,
        donorIdentityKey: gift.donorIdentityKey,
        orgIdentityKey: gift.orgIdentityKey,
        giftTxid: gift.giftTxid,
        at: '2026-08-18T16:02:00.000Z'
      },
      signature: [1, 2, 3, 4, 5, 6, 7, 8],
      signingKey: gift.orgIdentityKey,
      announceTxid: 'aa'.repeat(32)
    }
    const receipted = applyReceiptAnnouncement(gifted, announcement)
    assert.equal(receipted[0].status, 'receipted')
    assert.equal(receipted[0].receipt?.giftTxid, gift.giftTxid)
    assert.equal(receipted[0].announceTxid, announcement.announceTxid)
    assert.equal(issuedReceipts(receipted).length, 1)
  })

  it('does not let a Message Box self-miss block an overlay receipt', () => {
    const self = PrivateKey.fromRandom().toPublicKey().toString()
    const gift = giftNotice({
      donorIdentityKey: self,
      orgIdentityKey: self
    })
    const gifted = applyEvent([], { type: 'gift', gift })
    assert.equal(gifted[0].status, 'gifted')

    const announcement = {
      receipt: {
        v: 1 as const,
        purpose: gift.purpose,
        purposeHash: gift.purposeHash,
        amountUsd: gift.amountUsd,
        amountSats: gift.amountSats,
        donorIdentityKey: self,
        orgIdentityKey: self,
        giftTxid: gift.giftTxid,
        at: '2026-08-18T16:02:00.000Z'
      },
      signature: [9, 8, 7, 6, 5, 4, 3, 2],
      signingKey: self,
      announceTxid: 'bb'.repeat(32)
    }

    const afterMiss = applyDonorUpdates(gifted, { messages: [] })
    assert.equal(afterMiss[0].status, 'gifted')

    const receipted = applyDonorUpdates(afterMiss, {
      messages: [],
      receipts: [announcement]
    })
    assert.equal(receipted[0].status, 'receipted')
    assert.equal(receipted[0].receipt?.purpose, gift.purpose)
  })

  it('refuses a mismatched purpose hash', () => {
    const gift = giftNotice()
    const gifted = [giftFromNotice(gift)]
    assert.throws(() => applyEvent(gifted, {
      type: 'ack',
      ack: {
        v: 1,
        kind: 'ack',
        giftId: gift.giftId,
        purposeHash: '00'.repeat(32),
        orgIdentityKey: gift.orgIdentityKey,
        donorIdentityKey: gift.donorIdentityKey,
        giftTxid: gift.giftTxid,
        at: '2026-08-18T16:01:00.000Z'
      }
    }), /purpose/)

    assert.throws(() => giftFromNotice({
      ...gift,
      purposeHash: '11'.repeat(32)
    }), /Purpose hash/)

    const again = applyEvent(gifted, { type: 'gift', gift })
    assert.equal(again.length, 1)
  })

  it('merges overlay gifts without wiping an acknowledged row', () => {
    const gift = giftNotice()
    const acknowledged = applyEvent(
      applyEvent([], { type: 'gift', gift }),
      {
        type: 'ack',
        ack: {
          v: 1,
          kind: 'ack',
          giftId: gift.giftId,
          purposeHash: gift.purposeHash,
          orgIdentityKey: gift.orgIdentityKey,
          donorIdentityKey: gift.donorIdentityKey,
          giftTxid: gift.giftTxid,
          at: '2026-08-18T16:01:00.000Z'
        }
      }
    )
    const extra = giftNotice({ giftId: 'gift-2', giftTxid: 'ef'.repeat(32), keyID: 'gift-2' })
    const merged = mergeIncomingGifts(acknowledged, [gift, extra])
    assert.equal(merged.length, 2)
    assert.equal(merged[0].status, 'acknowledged')
    assert.equal(merged[1].status, 'gifted')
  })
})
