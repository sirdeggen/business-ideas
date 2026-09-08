/**
 * Trace receipt protocol (PushDrop / BRC-48 fields).
 *
 * Pay a small fee to register a provenance receipt, then look it up
 * on overlay. The receipt answers what / who / rights / paid.
 *
 * Public Pages uses tm_anytx / ls_anytx. Client filters on MAGIC
 * `trace`. Do not reuse datasets, record, titles, or namelease MAGIC.
 * This is not a dataset stall and not a signed record desk.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'trace']
export const BASKET = 'trace'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'trace'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'trace'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const WHAT_MAX = 160
export const WHO_MAX = 80
export const RIGHTS_MAX = 80
export const TOKEN_LEN = 16
export const FEE_SATS = 100_000
export const FEE_MIN = 1
export const FEE_MAX = 100_000_000

export const KIND = 'register' as const
export type TraceKind = typeof KIND

export interface TraceReceipt {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: TraceKind
  token: string
  what: string
  who: string
  rights: string
  feePaid: number
  timestamp: string
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const TOKEN_HEX = /^[0-9a-f]{8,64}$/

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function nowIso(now = new Date()): string {
  return now.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function normalizeQuery(raw: string): string {
  return raw.trim().toLowerCase()
}

export function normalizeWhat(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function normalizeWho(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function normalizeRights(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function whatError(raw: string): string | null {
  const what = normalizeWhat(raw)
  if (!what) return 'Say what this receipt is for.'
  if (what.length > WHAT_MAX) return 'That is too long.'
  return null
}

export function whoError(raw: string): string | null {
  const who = normalizeWho(raw)
  if (!who) return 'Say who holds the rights.'
  if (who.length > WHO_MAX) return 'That name is too long.'
  return null
}

export function rightsError(raw: string): string | null {
  const rights = normalizeRights(raw)
  if (!rights) return 'Say what rights this covers.'
  if (rights.length > RIGHTS_MAX) return 'Those rights are too long.'
  return null
}

export function assertWhat(raw: string): string {
  const what = normalizeWhat(raw)
  const invalid = whatError(what)
  if (invalid) throw new Error(invalid)
  return what
}

export function assertWho(raw: string): string {
  const who = normalizeWho(raw)
  const invalid = whoError(who)
  if (invalid) throw new Error(invalid)
  return who
}

export function assertRights(raw: string): string {
  const rights = normalizeRights(raw)
  const invalid = rightsError(rights)
  if (invalid) throw new Error(invalid)
  return rights
}

export function validateFee(sats: number): string | null {
  if (!Number.isInteger(sats)) return 'Fee must be a whole number of sats.'
  if (sats < FEE_MIN) return 'Fee must be at least 1 sat.'
  if (sats > FEE_MAX) return 'Fee is too high for v0.'
  return null
}

export function formatSats(amount: number): string {
  const n = Math.trunc(amount)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n.toLocaleString('en-US')} sats`
}

export function makeToken(input: {
  what: string
  who: string
  rights: string
  timestamp: string
  nonce: string
}): string {
  return sha256Hex([
    normalizeWhat(input.what),
    normalizeWho(input.who),
    normalizeRights(input.rights),
    input.timestamp,
    input.nonce
  ].join('\n')).slice(0, TOKEN_LEN)
}

export function isToken(value: string): boolean {
  return TOKEN_HEX.test(value.trim().toLowerCase())
}

export function looksLikeTokenQuery(raw: string): boolean {
  const q = normalizeQuery(raw)
  return TOKEN_HEX.test(q)
}

function isPrintableUtf8(bytes: number[]): boolean {
  return bytes.length > 0 && bytes.every((byte) => byte >= 0x09 && byte <= 0x7e)
}

function looksLikeLockPadding(field: number[] | Uint8Array): boolean {
  const bytes = Array.from(field)
  if (isPrintableUtf8(bytes)) return false
  if (bytes.length === 33 && (bytes[0] === 2 || bytes[0] === 3)) return true
  if (bytes.length >= 64 && bytes.length <= 80) return true
  return false
}

function semanticFields(fields: Array<number[] | Uint8Array>): Array<number[] | Uint8Array> {
  return fields.filter((field) => !looksLikeLockPadding(field))
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

export function validateReceipt(receipt: TraceReceipt): string | null {
  if (receipt.magic !== MAGIC) return 'Not a trace receipt.'
  if (receipt.version !== SCHEMA_VERSION) return 'Unsupported schema version.'
  if (receipt.kind !== KIND) return 'Kind must be register.'
  if (!isToken(receipt.token) || receipt.token.length !== TOKEN_LEN) {
    return 'Token must be 16 hex chars.'
  }
  const invalidWhat = whatError(receipt.what)
  if (invalidWhat) return invalidWhat
  if (receipt.what !== normalizeWhat(receipt.what)) return 'What must be normalized.'
  const invalidWho = whoError(receipt.who)
  if (invalidWho) return invalidWho
  if (receipt.who !== normalizeWho(receipt.who)) return 'Who must be normalized.'
  const invalidRights = rightsError(receipt.rights)
  if (invalidRights) return invalidRights
  if (receipt.rights !== normalizeRights(receipt.rights)) return 'Rights must be normalized.'
  const feeError = validateFee(receipt.feePaid)
  if (feeError) return feeError
  if (!isIsoDateTime(receipt.timestamp)) return 'Timestamp must be a date and time.'
  return null
}

export function encodeReceiptFields(
  receipt: Omit<TraceReceipt, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: TraceReceipt = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: KIND,
    ...receipt
  }
  const invalid = validateReceipt(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(KIND),
    stringToUtf8Bytes(receipt.token),
    stringToUtf8Bytes(receipt.what),
    stringToUtf8Bytes(receipt.who),
    stringToUtf8Bytes(receipt.rights),
    stringToUtf8Bytes(String(receipt.feePaid)),
    stringToUtf8Bytes(receipt.timestamp)
  ]
}

function receiptFromParts(parts: {
  token: string
  what: string
  who: string
  rights: string
  feePaid: number
  timestamp: string
}): TraceReceipt | null {
  const receipt: TraceReceipt = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: KIND,
    token: parts.token.toLowerCase(),
    what: normalizeWhat(parts.what),
    who: normalizeWho(parts.who),
    rights: normalizeRights(parts.rights),
    feePaid: parts.feePaid,
    timestamp: parts.timestamp
  }
  return validateReceipt(receipt) ? null : receipt
}

export function parseTraceFields(fields: Array<number[] | Uint8Array>): TraceReceipt | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 8) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION || kind !== KIND) return null
  const feePaid = Number(rest[6])
  if (!Number.isInteger(feePaid)) return null
  return receiptFromParts({
    token: rest[2],
    what: rest[3],
    who: rest[4],
    rights: rest[5],
    feePaid,
    timestamp: rest[7]
  })
}

export function filterTracePayloads(payloads: TraceReceipt[]): TraceReceipt[] {
  return payloads.filter((payload) => payload.magic === MAGIC && !validateReceipt(payload))
}

/** Latest receipt for a token. Search also matches what / who. */
export function matchReceipts(
  receipts: TraceReceipt[],
  query: string
): TraceReceipt[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const tokenQuery = looksLikeTokenQuery(q)
  const found = receipts.filter((receipt) => {
    if (tokenQuery) {
      return receipt.token === q || receipt.token.startsWith(q) || q.startsWith(receipt.token)
    }
    const what = normalizeQuery(receipt.what)
    const who = normalizeQuery(receipt.who)
    return what === q || what.includes(q) || who === q || who.includes(q)
  })
  return [...found].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function selectReceipt(
  receipts: TraceReceipt[],
  query: string
): TraceReceipt | null {
  const matches = matchReceipts(receipts, query)
  return matches[0] ?? null
}

export function formatWhen(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return timestamp
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
