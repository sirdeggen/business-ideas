/**
 * Title desk protocol (PushDrop / BRC-48 fields).
 *
 * A titled document is custody of who holds it now: label, document hash,
 * holder identity. Issue pays to create the first holder. Transfer spends
 * the old title token and posts the new holder. Export is a custody reading
 * the current holder can take — not a paid dump of a field reading.
 * Not a bank, not a signed record, not a dataset stall.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'titles']
export const BASKET = 'titles'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'title'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'titles'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const LABEL_MAX = 160
export const DUMP_MAX = 4000
export const PRICE_MIN = 1
export const PRICE_MAX = 100_000_000
export const TRANSFER_SATS = 1

export const KINDS = ['title', 'export'] as const
export type TitleKind = (typeof KINDS)[number]

export interface TitleToken {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'title'
  titleId: string
  label: string
  docHash: string
  holder: string
  issuer: string
  priceSats: number
  timestamp: string
}

export interface TitleExport {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'export'
  titleId: string
  holder: string
  docHash: string
  timestamp: string
}

export type TitlePayload = TitleToken | TitleExport

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

export function isDocHash(value: string): boolean {
  return HASH_HEX.test(value.trim().replace(/^0x/i, '').toLowerCase())
}

/** 64-hex hash as-is; otherwise sha256 of the pasted bytes. */
export function resolveDocHash(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const hex = trimmed.replace(/^0x/i, '').toLowerCase()
  if (HASH_HEX.test(hex) && !trimmed.includes('\n') && trimmed.length <= 66) {
    return hex
  }
  return sha256Hex(input)
}

export function makeTitleId(
  issuer: string,
  label: string,
  timestamp: string,
  nonce: string
): string {
  return sha256Hex([issuer, label, timestamp, nonce].join('\n'))
}

export function isHolder(title: Pick<TitleToken, 'holder'>, identityKey: string): boolean {
  return Boolean(identityKey) && title.holder === identityKey
}

/** Latest title token per titleId — the current holder. */
export function currentTitles<T extends Pick<TitleToken, 'titleId' | 'timestamp'>>(rows: T[]): T[] {
  const latest = new Map<string, T>()
  const chronological = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  for (const row of chronological) {
    latest.set(row.titleId, row)
  }
  return [...latest.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
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

export function encodeTitleFields(
  item: Omit<TitleToken, 'magic' | 'version' | 'kind'>
): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('title'),
    stringToUtf8Bytes(item.titleId),
    stringToUtf8Bytes(item.label),
    stringToUtf8Bytes(item.docHash),
    stringToUtf8Bytes(item.holder),
    stringToUtf8Bytes(item.issuer),
    stringToUtf8Bytes(String(item.priceSats)),
    stringToUtf8Bytes(item.timestamp)
  ]
}

export function encodeExportFields(
  item: Omit<TitleExport, 'magic' | 'version' | 'kind'>
): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('export'),
    stringToUtf8Bytes(item.titleId),
    stringToUtf8Bytes(item.holder),
    stringToUtf8Bytes(item.docHash),
    stringToUtf8Bytes(item.timestamp)
  ]
}

function titleFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): TitleToken {
  return {
    magic: MAGIC,
    version: fieldUtf8(fields[start + 1]) as typeof SCHEMA_VERSION,
    kind: 'title',
    titleId: fieldUtf8(fields[start + 3]),
    label: fieldUtf8(fields[start + 4]),
    docHash: fieldUtf8(fields[start + 5]).toLowerCase(),
    holder: fieldUtf8(fields[start + 6]),
    issuer: fieldUtf8(fields[start + 7]),
    priceSats: Number(fieldUtf8(fields[start + 8])),
    timestamp: fieldUtf8(fields[start + 9])
  }
}

function exportFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): TitleExport {
  return {
    magic: MAGIC,
    version: fieldUtf8(fields[start + 1]) as typeof SCHEMA_VERSION,
    kind: 'export',
    titleId: fieldUtf8(fields[start + 3]),
    holder: fieldUtf8(fields[start + 4]),
    docHash: fieldUtf8(fields[start + 5]).toLowerCase(),
    timestamp: fieldUtf8(fields[start + 6])
  }
}

/**
 * Accepts live lock() scripts where MAGIC is anywhere in the field list.
 * Extra pubkey/signature fields may sit before or after the title row.
 */
export function parseTitleFields(fields: Array<number[] | Uint8Array>): TitlePayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  try {
    const kind = fieldUtf8(fields[start + 2])
    if (kind === 'title') {
      if (start + 9 >= fields.length) return null
      const parsed = titleFromFields(fields, start)
      if (validateTitle(parsed)) return null
      return parsed
    }
    if (kind === 'export') {
      if (start + 6 >= fields.length) return null
      const parsed = exportFromFields(fields, start)
      if (validateExport(parsed)) return null
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

export function validateTitle(item: TitleToken): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'title') return 'kind must be title'
  if (!HASH_HEX.test(item.titleId)) return 'title id must be 64 hex chars'
  if (item.label.trim().length < 1) return 'title is required'
  if (item.label.length > LABEL_MAX) return 'title too long'
  if (!HASH_HEX.test(item.docHash)) return 'document hash must be 64 hex chars'
  if (!isIdentityKey(item.holder)) return 'holder must be an identity key'
  if (!isIdentityKey(item.issuer)) return 'issuer must be an identity key'
  const priceError = validatePrice(item.priceSats)
  if (priceError) return priceError
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validateExport(item: TitleExport): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'export') return 'kind must be export'
  if (!HASH_HEX.test(item.titleId)) return 'title id must be 64 hex chars'
  if (!isIdentityKey(item.holder)) return 'holder must be an identity key'
  if (!HASH_HEX.test(item.docHash)) return 'document hash must be 64 hex chars'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}
