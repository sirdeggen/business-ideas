/**
 * Vault Claim desk protocol (PushDrop / BRC-48 fields).
 *
 * One claim token is one specific vaulted physical. Mint names the item.
 * Transfer spends the old claim and posts the new holder. Burn spends the
 * claim and posts a redeem so the vault can ship. Deterministic — not a
 * pack, not a titled e-doc, not a door ticket.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'vault-claim']
export const BASKET = 'vault-claim'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'vault'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'vault-claim'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const LABEL_MAX = 160
export const SERIAL_MAX = 80
export const HASH_NOTE_MAX = 4000
export const PRICE_MIN = 1
export const PRICE_MAX = 100_000_000
export const TRANSFER_SATS = 1
export const REDEEM_SATS = 1

export const KINDS = ['claim', 'redeem'] as const
export type ClaimKind = (typeof KINDS)[number]

export interface ClaimToken {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'claim'
  claimId: string
  label: string
  itemSerial: string
  itemHash: string
  holder: string
  issuer: string
  priceSats: number
  timestamp: string
}

export interface ClaimRedeem {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'redeem'
  claimId: string
  holder: string
  itemSerial: string
  itemHash: string
  timestamp: string
}

export type ClaimPayload = ClaimToken | ClaimRedeem

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

export function isItemHash(value: string): boolean {
  const hex = value.trim().replace(/^0x/i, '').toLowerCase()
  return hex.length === 0 || HASH_HEX.test(hex)
}

/** Empty stays empty. 64-hex as-is. Otherwise sha256 of the pasted note. */
export function resolveItemHash(input: string): string {
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
  itemSerial: string,
  timestamp: string,
  nonce: string
): string {
  return sha256Hex([issuer, itemSerial, timestamp, nonce].join('\n'))
}

export function isHolder(claim: Pick<ClaimToken, 'holder'>, identityKey: string): boolean {
  return Boolean(identityKey) && claim.holder === identityKey
}

function serialKey(issuer: string, itemSerial: string): string {
  return `${issuer}\n${itemSerial.trim().toLowerCase()}`
}

/** Latest unredeemed claim per claimId. Redeemed items leave the live list. */
export function currentClaims<
  T extends Pick<ClaimToken, 'claimId' | 'timestamp'>,
  R extends Pick<ClaimRedeem, 'claimId' | 'timestamp'>
>(rows: T[], redeems: R[] = []): T[] {
  const redeemedAt = new Map<string, string>()
  for (const redeem of redeems) {
    const previous = redeemedAt.get(redeem.claimId)
    if (!previous || redeem.timestamp.localeCompare(previous) > 0) {
      redeemedAt.set(redeem.claimId, redeem.timestamp)
    }
  }
  const latest = new Map<string, T>()
  const chronological = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  for (const row of chronological) {
    latest.set(row.claimId, row)
  }
  return [...latest.values()]
    .filter((row) => {
      const burned = redeemedAt.get(row.claimId)
      return !burned || burned.localeCompare(row.timestamp) < 0
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

/** One live claim per vaulted serial from the same issuer. */
export function liveSerialTaken(
  rows: Array<Pick<ClaimToken, 'issuer' | 'itemSerial' | 'claimId'>>,
  issuer: string,
  itemSerial: string,
  exceptClaimId?: string
): boolean {
  const key = serialKey(issuer, itemSerial)
  return rows.some((row) => (
    serialKey(row.issuer, row.itemSerial) === key
    && row.claimId !== exceptClaimId
  ))
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
    stringToUtf8Bytes(item.itemSerial),
    stringToUtf8Bytes(item.itemHash),
    stringToUtf8Bytes(item.holder),
    stringToUtf8Bytes(item.issuer),
    stringToUtf8Bytes(String(item.priceSats)),
    stringToUtf8Bytes(item.timestamp)
  ]
}

export function encodeRedeemFields(
  item: Omit<ClaimRedeem, 'magic' | 'version' | 'kind'>
): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('redeem'),
    stringToUtf8Bytes(item.claimId),
    stringToUtf8Bytes(item.holder),
    stringToUtf8Bytes(item.itemSerial),
    stringToUtf8Bytes(item.itemHash),
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
    itemSerial: fieldUtf8(fields[start + 5]),
    itemHash: fieldUtf8(fields[start + 6]).toLowerCase(),
    holder: fieldUtf8(fields[start + 7]),
    issuer: fieldUtf8(fields[start + 8]),
    priceSats: Number(fieldUtf8(fields[start + 9])),
    timestamp: fieldUtf8(fields[start + 10])
  }
}

function redeemFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): ClaimRedeem {
  return {
    magic: MAGIC,
    version: fieldUtf8(fields[start + 1]) as typeof SCHEMA_VERSION,
    kind: 'redeem',
    claimId: fieldUtf8(fields[start + 3]),
    holder: fieldUtf8(fields[start + 4]),
    itemSerial: fieldUtf8(fields[start + 5]),
    itemHash: fieldUtf8(fields[start + 6]).toLowerCase(),
    timestamp: fieldUtf8(fields[start + 7])
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
      if (start + 7 >= fields.length) return null
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
  if (sats < PRICE_MIN) return 'price must be at least 1 sat'
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
  if (item.itemSerial.trim().length < 1) return 'item is required'
  if (item.itemSerial.length > SERIAL_MAX) return 'item too long'
  if (item.itemHash && !HASH_HEX.test(item.itemHash)) return 'item hash must be 64 hex chars'
  if (!isIdentityKey(item.holder)) return 'holder must be an identity key'
  if (!isIdentityKey(item.issuer)) return 'issuer must be an identity key'
  const priceError = validatePrice(item.priceSats)
  if (priceError) return priceError
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validateRedeem(item: ClaimRedeem): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'redeem') return 'kind must be redeem'
  if (!HASH_HEX.test(item.claimId)) return 'claim id must be 64 hex chars'
  if (!isIdentityKey(item.holder)) return 'holder must be an identity key'
  if (item.itemSerial.trim().length < 1) return 'item is required'
  if (item.itemHash && !HASH_HEX.test(item.itemHash)) return 'item hash must be 64 hex chars'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}
