/**
 * Grant Receipt Desk protocol.
 *
 * Outbound restricted disbursement + a receipt bound to a purpose hash.
 * Not a US DAF, not a tax shop, not a 2-of-3 vault.
 *
 * Purpose hash: lowercase hex SHA-256 of the UTF-8 bytes of the exact
 * canonical purpose string. Canonical purpose is the typed purpose with
 * only leading and trailing Unicode whitespace removed (String#trim).
 * No case folding, no NFC, no collapsed spaces.
 *
 * Default purpose "roof repair" is those eleven characters:
 *   r o o f [space] r e p a i r
 * SHA-256 = 2b4ad31adad0c899a981c3cfbcdb38e41048a16be77681644faa712e8f0174cc
 */

import {
  BigNumber,
  ECDSA,
  Hash,
  PublicKey,
  Signature,
  Utils
} from '@bsv/sdk'

export const DEFAULT_PURPOSE = 'roof repair'
export const DEFAULT_PURPOSE_HASH =
  '2b4ad31adad0c899a981c3cfbcdb38e41048a16be77681644faa712e8f0174cc'

export const PROTOCOL_ID: [1, string] = [1, 'grant receipt']
export const ANNOUNCE_PROTOCOL_ID: [0, string] = [0, 'grant receipt']
export const PROTOCOL_TAG = 'grant receipt'
/** Second PushDrop field on a public *gift* announcement. Receipts keep JSON there. */
export const ANNOUNCE_KIND_GIFT = 'gift'
export const BASKET = 'grant receipt'
export const MESSAGE_BOX = 'grant receipt'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const OVERLAY_HOST = 'https://overlay-us-1.bsvb.tech'
export const RECEIPT_VERSION = 1 as const

export const MESSAGE_KINDS = ['gift', 'ack', 'receipt'] as const
export type MessageKind = (typeof MESSAGE_KINDS)[number]

export function utf8(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

export function utf8String(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function hexToBytes(hex: string): number[] {
  return Utils.toArray(hex.replace(/^0x/i, ''), 'hex') as number[]
}

export function bytesToHex(bytes: number[]): string {
  return Utils.toHex(bytes)
}

export function isIdentityKey(value: string): boolean {
  return /^(02|03)[0-9a-fA-F]{64}$/.test(value.trim())
}

export function shortKey(key: string, size = 8): string {
  const trimmed = key.trim()
  if (trimmed.length <= size * 2) return trimmed
  return `${trimmed.slice(0, size)}…${trimmed.slice(-6)}`
}

export function canonicalPurpose(purpose: string): string {
  return purpose.trim()
}

export function purposeHash(purpose: string): string {
  const exact = canonicalPurpose(purpose)
  if (!exact) throw new Error('Purpose is required')
  return bytesToHex(Hash.sha256(utf8(exact)))
}

export function assertPurposeHash(purpose: string, hash: string): string {
  const expected = purposeHash(purpose)
  if (expected !== hash.trim().toLowerCase()) {
    throw new Error('Purpose hash does not match the stated purpose')
  }
  return expected
}

export interface CanonicalReceipt {
  v: 1
  purpose: string
  purposeHash: string
  amountUsd: string
  amountSats: number
  donorIdentityKey: string
  orgIdentityKey: string
  giftTxid: string
  at: string
}

function normalizeIdentity(value: string): string {
  const trimmed = value.trim()
  if (!isIdentityKey(trimmed)) {
    throw new Error('Identity must be a 66-hex compressed key')
  }
  return trimmed.toLowerCase()
}

function normalizeTxid(value: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(trimmed)) {
    throw new Error('Gift transaction is missing')
  }
  return trimmed
}

export function buildReceipt(input: {
  purpose: string
  purposeHash: string
  amountUsd: string
  amountSats: number
  donorIdentityKey: string
  orgIdentityKey: string
  giftTxid: string
  at?: string
}): CanonicalReceipt {
  const purpose = canonicalPurpose(input.purpose)
  const hash = assertPurposeHash(purpose, input.purposeHash)
  if (!Number.isInteger(input.amountSats) || input.amountSats < 1) {
    throw new Error('Amount is missing')
  }
  const amountUsd = input.amountUsd.trim()
  if (!amountUsd) throw new Error('Dollar amount is required')
  return {
    v: RECEIPT_VERSION,
    purpose,
    purposeHash: hash,
    amountUsd,
    amountSats: input.amountSats,
    donorIdentityKey: normalizeIdentity(input.donorIdentityKey),
    orgIdentityKey: normalizeIdentity(input.orgIdentityKey),
    giftTxid: normalizeTxid(input.giftTxid),
    at: input.at || new Date().toISOString()
  }
}

/** Stable JSON used as the createSignature data payload. Key order is fixed. */
export function canonicalReceiptJson(receipt: CanonicalReceipt): string {
  const built = buildReceipt(receipt)
  return JSON.stringify({
    v: built.v,
    purpose: built.purpose,
    purposeHash: built.purposeHash,
    amountUsd: built.amountUsd,
    amountSats: built.amountSats,
    donorIdentityKey: built.donorIdentityKey,
    orgIdentityKey: built.orgIdentityKey,
    giftTxid: built.giftTxid,
    at: built.at
  })
}

export function canonicalReceiptBytes(receipt: CanonicalReceipt): number[] {
  return utf8(canonicalReceiptJson(receipt))
}

export function receiptKeyID(receipt: Pick<CanonicalReceipt, 'giftTxid'>): string {
  return receipt.giftTxid.trim().toLowerCase()
}

/** BRC-100 createSignature({ data }) hashes once with SHA-256 before ECDSA. */
export function verifyWalletDataSignature(
  publicKeyHex: string,
  data: number[],
  derSignature: number[]
): boolean {
  try {
    const hash = Hash.sha256(data)
    const key = PublicKey.fromString(publicKeyHex)
    const signature = Signature.fromDER(derSignature)
    return ECDSA.verify(new BigNumber(hash), signature, key)
  } catch {
    return false
  }
}

export function verifyReceiptPurpose(receipt: CanonicalReceipt): boolean {
  try {
    assertPurposeHash(receipt.purpose, receipt.purposeHash)
    return true
  } catch {
    return false
  }
}

export interface GiftNotice {
  v: 1
  kind: 'gift'
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
  at: string
}

export interface AckNotice {
  v: 1
  kind: 'ack'
  giftId: string
  purposeHash: string
  orgIdentityKey: string
  donorIdentityKey: string
  giftTxid: string
  at: string
}

export interface ReceiptNotice {
  v: 1
  kind: 'receipt'
  giftId: string
  receipt: CanonicalReceipt
  signature: number[]
  signingKey?: string
  announceTxid?: string
  at: string
}

export type DeskMessage = GiftNotice | AckNotice | ReceiptNotice

export function isGiftNotice(value: unknown): value is GiftNotice {
  if (!value || typeof value !== 'object') return false
  const row = value as GiftNotice
  return row.v === 1 && row.kind === 'gift' && typeof row.giftId === 'string' && typeof row.purpose === 'string'
}

export function isAckNotice(value: unknown): value is AckNotice {
  if (!value || typeof value !== 'object') return false
  const row = value as AckNotice
  return row.v === 1 && row.kind === 'ack' && typeof row.giftId === 'string'
}

export function isReceiptNotice(value: unknown): value is ReceiptNotice {
  if (!value || typeof value !== 'object') return false
  const row = value as ReceiptNotice
  return row.v === 1 && row.kind === 'receipt' && Boolean(row.receipt) && Array.isArray(row.signature)
}

export function parseDeskMessage(value: unknown): DeskMessage | null {
  if (isGiftNotice(value) || isAckNotice(value) || isReceiptNotice(value)) return value
  return null
}

export function encodeAnnouncementFields(
  receipt: CanonicalReceipt,
  signature: number[],
  signingKey: string
): number[][] {
  return [
    utf8(PROTOCOL_TAG),
    utf8(canonicalReceiptJson(receipt)),
    signature,
    hexToBytes(signingKey)
  ]
}

export function parseAnnouncementFields(fields: number[][]): {
  receipt: CanonicalReceipt
  signature: number[]
  signingKey: string
} | null {
  if (fields.length < 3) return null
  if (utf8String(fields[0]) !== PROTOCOL_TAG) return null
  const second = utf8String(fields[1])
  if (second === ANNOUNCE_KIND_GIFT) return null
  try {
    const parsed = JSON.parse(second) as CanonicalReceipt & { kind?: string }
    if (parsed && parsed.kind === ANNOUNCE_KIND_GIFT) return null
    const receipt = buildReceipt(parsed)
    const signature = fields[2]
    if (!Array.isArray(signature) || signature.length < 8) return null
    const signingKey = fields[3] ? bytesToHex(fields[3]) : ''
    return { receipt, signature, signingKey }
  } catch {
    return null
  }
}

/** Public gift notice. Same protocol tag as receipts; kind field is the discriminator. */
export function giftAnnouncementJson(gift: GiftNotice): string {
  const purpose = canonicalPurpose(gift.purpose)
  const hash = assertPurposeHash(purpose, gift.purposeHash)
  if (!gift.giftId.trim()) throw new Error('Gift id is required')
  if (!Number.isInteger(gift.amountSats) || gift.amountSats < 1) {
    throw new Error('Amount is missing')
  }
  const amountUsd = gift.amountUsd.trim()
  if (!amountUsd) throw new Error('Dollar amount is required')
  const row: Record<string, unknown> = {
    v: 1,
    kind: ANNOUNCE_KIND_GIFT,
    giftId: gift.giftId.trim(),
    purpose,
    purposeHash: hash,
    amountUsd,
    amountSats: gift.amountSats,
    donorIdentityKey: normalizeIdentity(gift.donorIdentityKey),
    orgIdentityKey: normalizeIdentity(gift.orgIdentityKey),
    giftTxid: normalizeTxid(gift.giftTxid),
    keyID: (gift.keyID || gift.giftId).trim(),
    at: gift.at
  }
  if (gift.donorName?.trim()) row.donorName = gift.donorName.trim()
  if (gift.orgName?.trim()) row.orgName = gift.orgName.trim()
  return JSON.stringify(row)
}

export function encodeGiftAnnouncementFields(gift: GiftNotice): number[][] {
  return [
    utf8(PROTOCOL_TAG),
    utf8(ANNOUNCE_KIND_GIFT),
    utf8(giftAnnouncementJson(gift))
  ]
}

export function parseGiftAnnouncementFields(fields: number[][]): GiftNotice | null {
  if (fields.length < 3) return null
  if (utf8String(fields[0]) !== PROTOCOL_TAG) return null
  if (utf8String(fields[1]) !== ANNOUNCE_KIND_GIFT) return null
  try {
    const parsed = JSON.parse(utf8String(fields[2])) as unknown
    if (!isGiftNotice(parsed)) return null
    const purpose = canonicalPurpose(parsed.purpose)
    assertPurposeHash(purpose, parsed.purposeHash)
    return {
      v: 1,
      kind: 'gift',
      giftId: parsed.giftId.trim(),
      purpose,
      purposeHash: parsed.purposeHash.trim().toLowerCase(),
      amountUsd: parsed.amountUsd,
      amountSats: parsed.amountSats,
      donorIdentityKey: parsed.donorIdentityKey,
      orgIdentityKey: parsed.orgIdentityKey,
      giftTxid: parsed.giftTxid,
      keyID: parsed.keyID || parsed.giftId,
      donorName: parsed.donorName,
      orgName: parsed.orgName,
      at: parsed.at
    }
  } catch {
    return null
  }
}

export function receiptMatchesGift(
  receipt: CanonicalReceipt,
  gift: {
    giftTxid: string
    purposeHash: string
    donorIdentityKey: string
    orgIdentityKey: string
  }
): boolean {
  const txid = gift.giftTxid.trim().toLowerCase()
  if (txid && receipt.giftTxid.trim().toLowerCase() === txid) return true
  return (
    receipt.purposeHash.trim().toLowerCase() === gift.purposeHash.trim().toLowerCase() &&
    receipt.donorIdentityKey.trim().toLowerCase() === gift.donorIdentityKey.trim().toLowerCase() &&
    receipt.orgIdentityKey.trim().toLowerCase() === gift.orgIdentityKey.trim().toLowerCase()
  )
}

/** When the desk URL or give-link carries an org key, keep that desk's gifts. */
export function filterGiftsForOrg(gifts: GiftNotice[], orgIdentityKey?: string): GiftNotice[] {
  const org = orgIdentityKey?.trim()
  if (!org || !isIdentityKey(org)) return gifts
  const want = org.toLowerCase()
  return gifts.filter((row) => row.orgIdentityKey.trim().toLowerCase() === want)
}

export function verifyPublishedReceipt(
  receipt: CanonicalReceipt,
  signature: number[],
  signingKey: string
): boolean {
  if (!verifyReceiptPurpose(receipt)) return false
  if (!signingKey) return false
  return verifyWalletDataSignature(signingKey, canonicalReceiptBytes(receipt), signature)
}
