/**
 * Dataset stall protocol (PushDrop / BRC-48 fields).
 *
 * A seller posts one catalog row: title, license, sample hash, price.
 * The file is not on that row. A lab pays, then the file arrives on
 * Message Box (or this wallet’s basket). Receipt is written to overlay.
 * Not a radio network, not a crawler paywall, not one field-reading export.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'datasets']
export const BRC29_PROTOCOL: [2, string] = [2, '3241645161d8']
export const BASKET = 'datasets'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'dataset'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'datasets'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TITLE_MAX = 160
export const LICENSE_MAX = 80
export const DUMP_MAX = 4000
export const PRICE_MIN = 1
export const PRICE_MAX = 100_000_000

export const KINDS = ['listing', 'receipt'] as const
export type DatasetKind = (typeof KINDS)[number]

export interface DatasetListing {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'listing'
  listingId: string
  seller: string
  title: string
  license: string
  sampleHash: string
  priceSats: number
  timestamp: string
}

export interface DatasetReceipt {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'receipt'
  listingId: string
  buyer: string
  paidSats: number
  sampleHash: string
  timestamp: string
}

export type DatasetPayload = DatasetListing | DatasetReceipt

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

export function sampleHashOf(dump: string): string {
  return sha256Hex(dump)
}

export function makeListingId(
  seller: string,
  title: string,
  timestamp: string,
  nonce: string
): string {
  return sha256Hex([seller, title, timestamp, nonce].join('\n'))
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

export function encodeListingFields(
  item: Omit<DatasetListing, 'magic' | 'version' | 'kind'>
): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('listing'),
    stringToUtf8Bytes(item.listingId),
    stringToUtf8Bytes(item.seller),
    stringToUtf8Bytes(item.title),
    stringToUtf8Bytes(item.license),
    stringToUtf8Bytes(item.sampleHash),
    stringToUtf8Bytes(String(item.priceSats)),
    stringToUtf8Bytes(item.timestamp)
  ]
}

export function encodeReceiptFields(
  item: Omit<DatasetReceipt, 'magic' | 'version' | 'kind'>
): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('receipt'),
    stringToUtf8Bytes(item.listingId),
    stringToUtf8Bytes(item.buyer),
    stringToUtf8Bytes(String(item.paidSats)),
    stringToUtf8Bytes(item.sampleHash),
    stringToUtf8Bytes(item.timestamp)
  ]
}

function listingFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): DatasetListing | null {
  if (start + 9 >= fields.length) return null
  const ninth = fieldUtf8(fields[start + 9])
  const tenth = fields[start + 10] ? fieldUtf8(fields[start + 10]) : ''
  // New row: timestamp at +9. An older leak put dump at +9 and time at +10 —
  // keep the time, drop the dump so parse never returns file bytes.
  const timestamp = isIsoTime(ninth) ? ninth : (isIsoTime(tenth) ? tenth : '')
  if (!timestamp) return null
  return {
    magic: MAGIC,
    version: fieldUtf8(fields[start + 1]) as typeof SCHEMA_VERSION,
    kind: 'listing',
    listingId: fieldUtf8(fields[start + 3]),
    seller: fieldUtf8(fields[start + 4]),
    title: fieldUtf8(fields[start + 5]),
    license: fieldUtf8(fields[start + 6]),
    sampleHash: fieldUtf8(fields[start + 7]).toLowerCase(),
    priceSats: Number(fieldUtf8(fields[start + 8])),
    timestamp
  }
}

function receiptFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): DatasetReceipt {
  return {
    magic: MAGIC,
    version: fieldUtf8(fields[start + 1]) as typeof SCHEMA_VERSION,
    kind: 'receipt',
    listingId: fieldUtf8(fields[start + 3]),
    buyer: fieldUtf8(fields[start + 4]),
    paidSats: Number(fieldUtf8(fields[start + 5])),
    sampleHash: fieldUtf8(fields[start + 6]).toLowerCase(),
    timestamp: fieldUtf8(fields[start + 7])
  }
}

/**
 * Accepts live lock() scripts where MAGIC is anywhere in the field list.
 * Extra pubkey/signature fields may sit before or after the catalog row.
 * File bytes are never returned from a listing parse.
 */
export function parseDatasetFields(fields: Array<number[] | Uint8Array>): DatasetPayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  try {
    const kind = fieldUtf8(fields[start + 2])
    if (kind === 'listing') {
      const parsed = listingFromFields(fields, start)
      if (!parsed || validateListing(parsed)) return null
      return parsed
    }
    if (kind === 'receipt') {
      if (start + 7 >= fields.length) return null
      const parsed = receiptFromFields(fields, start)
      if (validateReceipt(parsed)) return null
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

export function validateFile(dump: string, sampleHash: string): string | null {
  if (dump.trim().length < 1) return 'dump is required'
  if (dump.length > DUMP_MAX) return 'dump too long for v0'
  if (sampleHash !== sampleHashOf(dump)) return 'sample hash does not match dump'
  return null
}

export function validateListing(item: DatasetListing): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'listing') return 'kind must be listing'
  if (!HASH_HEX.test(item.listingId)) return 'listing id must be 64 hex chars'
  if (!isIdentityKey(item.seller)) return 'seller must be an identity key'
  if (item.title.trim().length < 1) return 'title is required'
  if (item.title.length > TITLE_MAX) return 'title too long'
  if (item.license.trim().length < 1) return 'license is required'
  if (item.license.length > LICENSE_MAX) return 'license too long'
  if (!HASH_HEX.test(item.sampleHash)) return 'sample hash must be 64 hex chars'
  const priceError = validatePrice(item.priceSats)
  if (priceError) return priceError
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validateReceipt(item: DatasetReceipt): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'receipt') return 'kind must be receipt'
  if (!HASH_HEX.test(item.listingId)) return 'listing id must be 64 hex chars'
  if (!isIdentityKey(item.buyer)) return 'buyer must be an identity key'
  const priceError = validatePrice(item.paidSats)
  if (priceError) return priceError
  if (!HASH_HEX.test(item.sampleHash)) return 'sample hash must be 64 hex chars'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}
