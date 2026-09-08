/**
 * Vault claim protocol (PushDrop / BRC-48 fields).
 *
 * Custody of a claim on one vaulted physical item: label, item id, holder.
 * Issue posts the first holder. Transfer spends the old claim and posts the
 * new holder. Burn spends the claim and posts a redeem/ship receipt.
 * Deterministic: one claim token = one specific item. Not a titled e-doc,
 * not an event ticket, not a random pack.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'vault-claim']
export const BASKET = 'vault-claim'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'vaultclaim'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'vault-claim'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const LABEL_MAX = 160
export const ITEM_MAX = 160
export const SHIP_TO_MAX = 200
export const PRICE_MIN = 0
export const PRICE_MAX = 100_000_000
export const CLAIM_SATS = 1
export const TRANSFER_SATS = 1
export const REDEEM_SATS = 1

export const KINDS = ['claim', 'redeem'] as const
export type ClaimKind = (typeof KINDS)[number]
export type ClaimStatus = 'held' | 'redeemed'

export interface ClaimToken {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'claim'
  claimId: string
  label: string
  itemId: string
  sampleHash: string
  holder: string
  issuer: string
  priceSats: number
  timestamp: string
}

export interface RedeemReceipt {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'redeem'
  claimId: string
  label: string
  itemId: string
  holder: string
  requestId: string
  shipTo: string
  timestamp: string
}

export type ClaimPayload = ClaimToken | RedeemReceipt

export interface VaultClaimView {
  claimId: string
  label: string
  itemId: string
  sampleHash: string
  holder: string
  issuer: string
  priceSats: number
  timestamp: string
  status: ClaimStatus
  requestId?: string
  shipTo?: string
}

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const HASH_HEX = /^[0-9a-f]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function formatSats(sats: number): string {
  const n = Math.trunc(sats)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n} sats`
}

export function isSampleHash(value: string): boolean {
  const hex = value.trim().replace(/^0x/i, '').toLowerCase()
  return hex.length === 0 || HASH_HEX.test(hex)
}

/** Empty, a 64-hex hash as-is, or sha256 of the pasted bytes. */
export function resolveSampleHash(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const hex = trimmed.replace(/^0x/i, '').toLowerCase()
  if (HASH_HEX.test(hex) && !trimmed.includes('\n') && trimmed.length <= 66) {
    return hex
  }
  return sha256Hex(input)
}

export function makeClaimId(
  issuer: string,
  label: string,
  itemId: string,
  timestamp: string,
  nonce: string
): string {
  return sha256Hex([issuer, label, itemId, timestamp, nonce].join('\n'))
}

export function makeRequestId(
  claimId: string,
  holder: string,
  timestamp: string,
  nonce: string
): string {
  return sha256Hex([claimId, holder, timestamp, nonce].join('\n'))
}

export function isHolder(claim: Pick<ClaimToken, 'holder'>, identityKey: string): boolean {
  return Boolean(identityKey) && claim.holder === identityKey
}

/** Latest claim token per claimId — the current holder. */
export function currentClaims<T extends Pick<ClaimToken, 'claimId' | 'timestamp'>>(rows: T[]): T[] {
  const latest = new Map<string, T>()
  const chronological = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  for (const row of chronological) {
    latest.set(row.claimId, row)
  }
  return [...latest.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function latestRedeems<T extends Pick<RedeemReceipt, 'claimId' | 'timestamp'>>(rows: T[]): T[] {
  const latest = new Map<string, T>()
  const chronological = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  for (const row of chronological) {
    latest.set(row.claimId, row)
  }
  return [...latest.values()]
}

/** Held claims plus redeemed receipts, one row per claimId. */
export function currentVaultClaims(
  claims: ClaimToken[],
  redeems: RedeemReceipt[]
): VaultClaimView[] {
  const live = currentClaims(claims)
  const burned = latestRedeems(redeems)
  const redeemById = new Map(burned.map((row) => [row.claimId, row]))
  const views = new Map<string, VaultClaimView>()

  for (const claim of live) {
    const redeem = redeemById.get(claim.claimId)
    views.set(claim.claimId, {
      claimId: claim.claimId,
      label: claim.label,
      itemId: claim.itemId,
      sampleHash: claim.sampleHash,
      holder: redeem?.holder ?? claim.holder,
      issuer: claim.issuer,
      priceSats: claim.priceSats,
      timestamp: redeem?.timestamp ?? claim.timestamp,
      status: redeem ? 'redeemed' : 'held',
      requestId: redeem?.requestId,
      shipTo: redeem?.shipTo
    })
  }

  for (const redeem of burned) {
    if (views.has(redeem.claimId)) continue
    views.set(redeem.claimId, {
      claimId: redeem.claimId,
      label: redeem.label,
      itemId: redeem.itemId,
      sampleHash: '',
      holder: redeem.holder,
      issuer: redeem.holder,
      priceSats: 0,
      timestamp: redeem.timestamp,
      status: 'redeemed',
      requestId: redeem.requestId,
      shipTo: redeem.shipTo
    })
  }

  return [...views.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

function magicIndex(fields: Array<number[] | Uint8Array>): number {
  return fields.findIndex((field) => {
    try {
      return fieldUtf8(field) === MAGIC
    } catch {
      return false
    }
  })
}

export function encodeClaimFields(
  item: Omit<ClaimToken, 'magic' | 'version' | 'kind'>
): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('claim'),
    stringToUtf8Bytes(item.claimId),
    stringToUtf8Bytes(item.label),
    stringToUtf8Bytes(item.itemId),
    stringToUtf8Bytes(item.sampleHash),
    stringToUtf8Bytes(item.holder),
    stringToUtf8Bytes(item.issuer),
    stringToUtf8Bytes(String(item.priceSats)),
    stringToUtf8Bytes(item.timestamp)
  ]
}

export function encodeRedeemFields(
  item: Omit<RedeemReceipt, 'magic' | 'version' | 'kind'>
): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('redeem'),
    stringToUtf8Bytes(item.claimId),
    stringToUtf8Bytes(item.label),
    stringToUtf8Bytes(item.itemId),
    stringToUtf8Bytes(item.holder),
    stringToUtf8Bytes(item.requestId),
    stringToUtf8Bytes(item.shipTo),
    stringToUtf8Bytes(item.timestamp)
  ]
}

function claimFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): ClaimToken {
  return {
    magic: MAGIC,
    version: fieldUtf8(fields[start + 1]) as typeof SCHEMA_VERSION,
    kind: 'claim',
    claimId: fieldUtf8(fields[start + 3]),
    label: fieldUtf8(fields[start + 4]),
    itemId: fieldUtf8(fields[start + 5]),
    sampleHash: fieldUtf8(fields[start + 6]).toLowerCase(),
    holder: fieldUtf8(fields[start + 7]),
    issuer: fieldUtf8(fields[start + 8]),
    priceSats: Number(fieldUtf8(fields[start + 9])),
    timestamp: fieldUtf8(fields[start + 10])
  }
}

function redeemFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): RedeemReceipt {
  return {
    magic: MAGIC,
    version: fieldUtf8(fields[start + 1]) as typeof SCHEMA_VERSION,
    kind: 'redeem',
    claimId: fieldUtf8(fields[start + 3]),
    label: fieldUtf8(fields[start + 4]),
    itemId: fieldUtf8(fields[start + 5]),
    holder: fieldUtf8(fields[start + 6]),
    requestId: fieldUtf8(fields[start + 7]),
    shipTo: fieldUtf8(fields[start + 8]),
    timestamp: fieldUtf8(fields[start + 9])
  }
}

/**
 * Accepts live lock() scripts where MAGIC is anywhere in the field list.
 * Extra pubkey/signature fields may sit before or after the claim row.
 */
export function parseClaimFields(fields: Array<number[] | Uint8Array>): ClaimPayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  try {
    const kind = fieldUtf8(fields[start + 2])
    if (kind === 'claim') {
      if (start + 10 >= fields.length) return null
      const parsed = claimFromFields(fields, start)
      if (validateClaim(parsed)) return null
      return parsed
    }
    if (kind === 'redeem') {
      if (start + 9 >= fields.length) return null
      const parsed = redeemFromFields(fields, start)
      if (validateRedeem(parsed)) return null
      return parsed
    }
    return null
  } catch {
    return null
  }
}

export function isIsoTime(value: string): boolean {
  if (!ISO_TIME.test(value)) return false
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return !Number.isNaN(date.getTime())
}

export function validatePrice(sats: number): string | null {
  if (!Number.isInteger(sats)) return 'price must be a whole number of sats'
  if (sats < PRICE_MIN) return 'price cannot be negative'
  if (sats > PRICE_MAX) return 'price is too high for v0'
  return null
}

export function validateClaim(item: ClaimToken): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'claim') return 'kind must be claim'
  if (!HASH_HEX.test(item.claimId)) return 'claim id must be 64 hex chars'
  if (item.label.trim().length < 1) return 'label is required'
  if (item.label.length > LABEL_MAX) return 'label too long'
  if (item.itemId.trim().length < 1) return 'item id is required'
  if (item.itemId.length > ITEM_MAX) return 'item id too long'
  if (!isSampleHash(item.sampleHash)) return 'sample hash must be empty or 64 hex chars'
  if (!isIdentityKey(item.holder)) return 'holder must be an identity key'
  if (!isIdentityKey(item.issuer)) return 'issuer must be an identity key'
  const priceError = validatePrice(item.priceSats)
  if (priceError) return priceError
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validateRedeem(item: RedeemReceipt): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'redeem') return 'kind must be redeem'
  if (!HASH_HEX.test(item.claimId)) return 'claim id must be 64 hex chars'
  if (item.label.trim().length < 1) return 'label is required'
  if (item.label.length > LABEL_MAX) return 'label too long'
  if (item.itemId.trim().length < 1) return 'item id is required'
  if (item.itemId.length > ITEM_MAX) return 'item id too long'
  if (!isIdentityKey(item.holder)) return 'holder must be an identity key'
  if (!HASH_HEX.test(item.requestId)) return 'request id must be 64 hex chars'
  if (item.shipTo.trim().length < 1) return 'ship to is required'
  if (item.shipTo.length > SHIP_TO_MAX) return 'ship to too long'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}
