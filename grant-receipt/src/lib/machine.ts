import {
  buildReceipt,
  isAckNotice,
  isGiftNotice,
  isReceiptNotice,
  purposeHash,
  receiptMatchesGift,
  type AckNotice,
  type CanonicalReceipt,
  type DeskMessage,
  type GiftNotice,
  type ReceiptNotice
} from './protocol.ts'

export interface ReceiptAnnouncement {
  receipt: CanonicalReceipt
  signature: number[]
  signingKey: string
  announceTxid?: string
}

export const GIFT_STATUSES = ['gifted', 'acknowledged', 'receipted'] as const
export type GiftStatus = (typeof GIFT_STATUSES)[number]

export interface GiftRecord {
  giftId: string
  purpose: string
  purposeHash: string
  amountUsd: string
  amountSats: number
  donorIdentityKey: string
  orgIdentityKey: string
  giftTxid: string
  keyID: string
  beef?: number[]
  donorName?: string
  orgName?: string
  status: GiftStatus
  at: string
  ackAt?: string
  receipt?: CanonicalReceipt
  receiptSignature?: number[]
  signingKey?: string
  announceTxid?: string
  receiptAt?: string
}

export type MachineEvent =
  | { type: 'gift'; gift: GiftNotice }
  | { type: 'ack'; ack: AckNotice }
  | { type: 'receipt'; receipt: ReceiptNotice }

export function giftFromNotice(gift: GiftNotice): GiftRecord {
  const hash = purposeHash(gift.purpose)
  if (hash !== gift.purposeHash.trim().toLowerCase()) {
    throw new Error('Purpose hash does not match the stated purpose')
  }
  if (!gift.giftId.trim()) throw new Error('Gift id is required')
  return {
    giftId: gift.giftId,
    purpose: gift.purpose.trim(),
    purposeHash: hash,
    amountUsd: gift.amountUsd,
    amountSats: gift.amountSats,
    donorIdentityKey: gift.donorIdentityKey,
    orgIdentityKey: gift.orgIdentityKey,
    giftTxid: gift.giftTxid,
    keyID: gift.keyID || gift.giftId,
    beef: gift.beef,
    donorName: gift.donorName,
    orgName: gift.orgName,
    status: 'gifted',
    at: gift.at
  }
}

export function eventFromMessage(message: DeskMessage): MachineEvent {
  if (isGiftNotice(message)) return { type: 'gift', gift: message }
  if (isAckNotice(message)) return { type: 'ack', ack: message }
  if (isReceiptNotice(message)) return { type: 'receipt', receipt: message }
  throw new Error('Unknown message')
}

function findGift(gifts: GiftRecord[], giftId: string): GiftRecord | undefined {
  return gifts.find((row) => row.giftId === giftId)
}

export function matchGiftForReceipt(
  gifts: GiftRecord[],
  receipt: CanonicalReceipt
): GiftRecord | undefined {
  const txid = receipt.giftTxid.trim().toLowerCase()
  const byTxid = gifts.find((row) => row.giftTxid.trim().toLowerCase() === txid)
  if (byTxid) return byTxid
  const matches = gifts.filter((row) => receiptMatchesGift(receipt, row))
  return matches.find((row) => row.status !== 'receipted') ?? matches[matches.length - 1]
}

export function receiptNoticeFromAnnouncement(
  announcement: ReceiptAnnouncement,
  gift: GiftRecord
): ReceiptNotice {
  return {
    v: 1,
    kind: 'receipt',
    giftId: gift.giftId,
    receipt: announcement.receipt,
    signature: announcement.signature,
    signingKey: announcement.signingKey,
    announceTxid: announcement.announceTxid,
    at: announcement.receipt.at
  }
}

export function applyEvent(gifts: GiftRecord[], event: MachineEvent): GiftRecord[] {
  if (event.type === 'gift') {
    const existing = findGift(gifts, event.gift.giftId)
    if (existing) return gifts
    return [...gifts, giftFromNotice(event.gift)]
  }

  if (event.type === 'ack') {
    const current = findGift(gifts, event.ack.giftId)
    if (!current) throw new Error('No gift to acknowledge')
    if (current.status === 'receipted') throw new Error('Receipt already issued')
    if (current.purposeHash !== event.ack.purposeHash.trim().toLowerCase()) {
      throw new Error('Ack purpose does not match the gift')
    }
    return gifts.map((row) => (
      row.giftId === current.giftId
        ? { ...row, status: 'acknowledged', ackAt: event.ack.at }
        : row
    ))
  }

  const notice = event.receipt
  const current = findGift(gifts, notice.giftId) ?? matchGiftForReceipt(gifts, notice.receipt)
  if (!current) throw new Error('No gift for this receipt')
  if (current.status === 'receipted') throw new Error('Receipt already issued')
  const receipt = buildReceipt(notice.receipt)
  if (receipt.purposeHash !== current.purposeHash) {
    throw new Error('Receipt purpose does not match the gift')
  }
  if (!receiptMatchesGift(receipt, current)) {
    throw new Error('Receipt is not bound to this gift')
  }
  return gifts.map((row) => (
    row.giftId === current.giftId
      ? {
          ...row,
          status: 'receipted',
          receipt,
          receiptSignature: notice.signature,
          signingKey: notice.signingKey,
          announceTxid: notice.announceTxid,
          receiptAt: notice.at
        }
      : row
  ))
}

export function applyMessages(gifts: GiftRecord[], messages: DeskMessage[]): GiftRecord[] {
  let next = gifts
  for (const message of messages) {
    next = applyEvent(next, eventFromMessage(message))
  }
  return next
}

/** A public receipt announcement can flip a gifted row. Inbox ack is not required. */
export function applyReceiptAnnouncement(
  gifts: GiftRecord[],
  announcement: ReceiptAnnouncement
): GiftRecord[] {
  const match = matchGiftForReceipt(gifts, announcement.receipt)
  if (!match) throw new Error('No gift for this receipt')
  return applyEvent(gifts, {
    type: 'receipt',
    receipt: receiptNoticeFromAnnouncement(announcement, match)
  })
}

/**
 * Donor page: Message Box may be empty (send-to-self often misses listMessages).
 * Overlay receipt announcements still apply.
 */
export function applyDonorUpdates(
  gifts: GiftRecord[],
  incoming: {
    messages?: DeskMessage[]
    receipts?: ReceiptAnnouncement[]
    acks?: AckNotice[]
  }
): GiftRecord[] {
  let next = gifts
  for (const message of incoming.messages ?? []) {
    try {
      next = applyEvent(next, eventFromMessage(message))
    } catch {
      // Out-of-order inbox rows are ignored.
    }
  }
  for (const ack of incoming.acks ?? []) {
    try {
      next = applyEvent(next, { type: 'ack', ack })
    } catch {
      // Overlay ack is optional. Receipt is enough.
    }
  }
  for (const announcement of incoming.receipts ?? []) {
    try {
      next = applyReceiptAnnouncement(next, announcement)
    } catch {
      // No matching gift, or already receipted.
    }
  }
  return next
}

export function mergeIncomingGifts(current: GiftRecord[], incoming: GiftNotice[]): GiftRecord[] {
  let next = current
  for (const gift of incoming) {
    try {
      next = applyEvent(next, { type: 'gift', gift })
    } catch {
      // Duplicate or a bad purpose hash is skipped.
    }
  }
  return next
}

export function pendingAcks(gifts: GiftRecord[]): GiftRecord[] {
  return gifts.filter((row) => row.status === 'gifted')
}

export function pendingReceipts(gifts: GiftRecord[]): GiftRecord[] {
  return gifts.filter((row) => row.status === 'acknowledged')
}

export function issuedReceipts(gifts: GiftRecord[]): GiftRecord[] {
  return gifts.filter((row) => row.status === 'receipted')
}

export function statusLabel(status: GiftStatus): string {
  if (status === 'gifted') return 'Needs ack'
  if (status === 'acknowledged') return 'Needs receipt'
  return 'Receipt issued'
}
