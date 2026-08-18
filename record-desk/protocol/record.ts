/**
 * Signed record desk protocol (PushDrop / BRC-48 fields).
 *
 * A contributor posts one signed field reading as a 1-sat UTXO. The public
 * list shows name, kind, time, and hash. The full note is what a buyer
 * exports after paying. This is not AR, not tickets, and not a stamp card.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'records']
export const BRC29_PROTOCOL: [2, string] = [2, '3241645161d8']
export const BASKET = 'records'
export const TOPIC = 'tm_records'
export const LOOKUP_SERVICE = 'ls_records'
export const MAGIC = 'record'
export const SCHEMA_VERSION = '1'
export const DISPLAY_NAME_MAX = 80
export const NOTE_MAX = 2000
export const COORD_MAX = 40
export const EXPORT_PRICE_SATS = 10

export const KINDS = ['hours', 'inspection', 'note'] as const
export type RecordKind = typeof KINDS[number]

export interface RecordPayload {
  magic: typeof MAGIC
  schemaVersion: typeof SCHEMA_VERSION
  hash: string
  name: string
  kind: RecordKind
  note: string
  time: string
  lat: string
  lon: string
}

export type RecordAction = 'post' | 'invalid'

export interface Classification {
  action: RecordAction
  admitOutputIndexes: number[]
  reason?: string
}

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const HASH_HEX = /^[0-9a-f]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

/** Person or org name on the Post form. Trimmed, 1–80 characters. */
export function isDisplayName(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.length >= 1 && trimmed.length <= DISPLAY_NAME_MAX
}

/** On-chain contributor field: 66-hex identity key or a display name. */
export function isContributor(value: string): boolean {
  const trimmed = value.trim()
  return isIdentityKey(trimmed) || isDisplayName(trimmed)
}

/**
 * Resolve what to store for the contributor.
 * Advanced hex wins when present (must be a valid 66-hex key).
 * A 66-hex typed in the name field still records as hex.
 * Otherwise the trimmed name is stored.
 */
export function resolveContributor(name: string, advancedHex = ''): string | null {
  const hex = advancedHex.trim()
  const label = name.trim()
  if (hex) return isIdentityKey(hex) ? hex : null
  if (isIdentityKey(label) || isDisplayName(label)) return label
  return null
}

function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

export interface CanonicalFields {
  name: string
  kind: string
  note: string
  time: string
  lat: string
  lon: string
}

/** Stable hash input. Field order is part of the protocol. */
export function canonicalPayload(item: CanonicalFields): string {
  return [item.name, item.kind, item.note, item.time, item.lat, item.lon].join('\n')
}

export function recordHash(item: CanonicalFields): string {
  return sha256Hex(canonicalPayload(item))
}

export function encodeRecordFields(item: Omit<RecordPayload, 'magic' | 'schemaVersion' | 'hash'>): number[][] {
  const hash = recordHash(item)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(hash),
    stringToUtf8Bytes(item.name),
    stringToUtf8Bytes(item.kind),
    stringToUtf8Bytes(item.note),
    stringToUtf8Bytes(item.time),
    stringToUtf8Bytes(item.lat ?? ''),
    stringToUtf8Bytes(item.lon ?? '')
  ]
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

function payloadFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): RecordPayload {
  const schemaVersion = fieldUtf8(fields[start + 1])
  const hash = fieldUtf8(fields[start + 2]).toLowerCase()
  const name = fieldUtf8(fields[start + 3])
  const kind = fieldUtf8(fields[start + 4]) as RecordKind
  const note = fieldUtf8(fields[start + 5])
  const time = fieldUtf8(fields[start + 6])
  const lat = fields[start + 7] ? fieldUtf8(fields[start + 7]) : ''
  const lon = fields[start + 8] ? fieldUtf8(fields[start + 8]) : ''
  return {
    magic: MAGIC,
    schemaVersion: schemaVersion as typeof SCHEMA_VERSION,
    hash,
    name,
    kind,
    note,
    time,
    lat,
    lon
  }
}

/**
 * Accepts live lock() scripts where MAGIC is anywhere in the field list.
 * Extra pubkey/signature fields may sit before or after the record.
 * Lat/lon may be omitted. Hash mismatch still parses if the rest is valid
 * so a firehose list stays useful; validateRecord checks the hash.
 */
export function parseRecordFields(fields: Array<number[] | Uint8Array>): RecordPayload | null {
  const start = magicIndex(fields)
  if (start < 0 || start + 6 >= fields.length) return null
  try {
    const parsed = payloadFromFields(fields, start)
    if (validateRecord(parsed, { requireHashMatch: false })) return null
    return parsed
  } catch {
    return null
  }
}

/** Why parseRecordFields returned null — used when a list is non-empty but blind. */
export function explainRecordParse(fields: Array<number[] | Uint8Array>): string {
  if (fields.length === 0) return 'PushDrop has 0 fields'
  const start = magicIndex(fields)
  if (start < 0) {
    const preview = fields.slice(0, 4).map((field, index) => {
      try {
        const text = fieldUtf8(field)
        if (text.length > 0 && text.length <= 32 && /^[\x20-\x7e]+$/.test(text)) {
          return text
        }
      } catch {
        // Fall through to byte count.
      }
      return `field[${index}] ${Array.from(field).length}B`
    })
    return `magic mismatch (no ${MAGIC}; ${preview.join(', ')})`
  }
  if (start + 6 >= fields.length) {
    return `fields after ${MAGIC} incomplete (${fields.length - start} from magic, need version through time)`
  }
  try {
    const parsed = payloadFromFields(fields, start)
    return validateRecord(parsed, { requireHashMatch: false }) ?? 'unknown parse failure'
  } catch (error) {
    return error instanceof Error ? error.message : 'field decode failed'
  }
}

export function isIsoTime(value: string): boolean {
  if (!ISO_TIME.test(value)) return false
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return !Number.isNaN(date.getTime())
}

export function validateRecord(
  item: RecordPayload,
  options: { requireHashMatch?: boolean } = {}
): string | null {
  const requireHashMatch = options.requireHashMatch !== false
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.schemaVersion !== SCHEMA_VERSION) return 'unsupported schema version'
  if (!HASH_HEX.test(item.hash)) return 'record hash must be 64 hex chars'
  if (!isContributor(item.name)) return 'invalid contributor name'
  if (!KINDS.includes(item.kind)) return 'kind must be hours, inspection, or note'
  if (item.note.trim().length < 1) return 'note is required'
  if (item.note.length > NOTE_MAX) return 'note too long'
  if (!isIsoTime(item.time)) return 'timestamp must be ISO-8601'
  if (item.lat.length > COORD_MAX) return 'lat too long'
  if (item.lon.length > COORD_MAX) return 'lon too long'
  if (requireHashMatch && item.hash !== recordHash(item)) return 'record hash does not match payload'
  return null
}

/**
 * Local overlay admission: any transaction with one or more valid record
 * outputs is a post. Export receipts are not records and are not admitted.
 */
export function classifyRecordTransaction(
  outputItems: Array<{ index: number, item: RecordPayload }>
): Classification {
  const outputs = outputItems.filter(({ item }) => validateRecord(item) === null)
  if (outputs.length === 0) {
    return { action: 'invalid', admitOutputIndexes: [], reason: 'no valid signed records' }
  }
  return {
    action: 'post',
    admitOutputIndexes: outputs.map(({ index }) => index)
  }
}
