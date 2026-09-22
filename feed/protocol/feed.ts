/**
 * Feed Desk protocol (PushDrop / BRC-48 fields).
 *
 * A publisher posts a feed: label, metric type, price per query, optional
 * short subscription. The current reading is not on that row. A buyer pays
 * per query or opens a subscription, then receives a signed reading.
 * Not a provenance registration (trace) and not a paid dump export (records).
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'feed']
export const BRC29_PROTOCOL: [2, string] = [2, '3241645161d8']
export const BASKET = 'feed'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'feed'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'feed'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const LABEL_MAX = 80
export const VALUE_MAX = 80
export const UNIT_MAX = 24
export const PRICE_MIN = 1
export const PRICE_MAX = 100_000_000
export const SUB_HOURS_MAX = 168

export const METRIC_TYPES = ['price', 'index', 'metric'] as const
export type MetricType = (typeof METRIC_TYPES)[number]

export const KINDS = ['feed', 'pulse', 'sub', 'query', 'reading'] as const
export type FeedKind = (typeof KINDS)[number]

export type ReadingMode = 'query' | 'sub'

export interface FeedListing {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'feed'
  feedId: string
  publisher: string
  label: string
  metricType: MetricType
  unit: string
  queryPriceSats: number
  subPriceSats: number
  subHours: number
  valueHash: string
  timestamp: string
}

export interface FeedPulse {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'pulse'
  feedId: string
  publisher: string
  valueHash: string
  timestamp: string
}

export interface FeedSub {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'sub'
  feedId: string
  buyer: string
  paidSats: number
  expires: string
  timestamp: string
}

export interface FeedQuery {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'query'
  feedId: string
  buyer: string
  paidSats: number
  valueHash: string
  timestamp: string
}

export interface FeedReading {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'reading'
  feedId: string
  buyer: string
  label: string
  metricType: MetricType
  value: string
  unit: string
  paidSats: number
  mode: ReadingMode
  valueHash: string
  timestamp: string
}

export type FeedPayload = FeedListing | FeedPulse | FeedSub | FeedQuery | FeedReading

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const HASH_HEX = /^[0-9a-f]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isMetricType(value: string): value is MetricType {
  return (METRIC_TYPES as readonly string[]).includes(value)
}

export function isReadingMode(value: string): value is ReadingMode {
  return value === 'query' || value === 'sub'
}

export function readingHash(input: {
  label: string
  metricType: string
  value: string
  unit: string
  timestamp: string
}): string {
  return sha256Hex([
    input.label,
    input.metricType,
    input.value,
    input.unit,
    input.timestamp
  ].join('\n'))
}

export function makeFeedId(
  publisher: string,
  label: string,
  timestamp: string,
  nonce: string
): string {
  return sha256Hex([publisher, label, timestamp, nonce].join('\n'))
}

export function expiresAt(fromIso: string, hours: number): string {
  const date = new Date(fromIso)
  date.setTime(date.getTime() + hours * 60 * 60 * 1000)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function activeSubscription(
  subs: FeedSub[],
  buyer: string,
  feedId: string,
  nowMs: number
): FeedSub | null {
  const buyerKey = buyer.toLowerCase()
  const open = subs.filter((sub) => {
    if (sub.feedId !== feedId) return false
    if (sub.buyer.toLowerCase() !== buyerKey) return false
    const expiry = new Date(sub.expires).getTime()
    return Number.isFinite(expiry) && expiry > nowMs
  })
  open.sort((a, b) => b.expires.localeCompare(a.expires))
  return open[0] ?? null
}

export function latestCommitment(
  feed: Pick<FeedListing, 'feedId' | 'publisher' | 'valueHash' | 'timestamp'>,
  pulses: FeedPulse[]
): { valueHash: string, timestamp: string } {
  const publisher = feed.publisher.toLowerCase()
  const mine = pulses.filter((pulse) => (
    pulse.feedId === feed.feedId && pulse.publisher.toLowerCase() === publisher
  ))
  mine.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  const top = mine[0]
  if (top && top.timestamp >= feed.timestamp) {
    return { valueHash: top.valueHash, timestamp: top.timestamp }
  }
  return { valueHash: feed.valueHash, timestamp: feed.timestamp }
}

export function dedupeFeeds<T extends Pick<FeedListing, 'feedId' | 'timestamp'>>(feeds: T[]): T[] {
  const byId = new Map<string, T>()
  for (const feed of feeds) {
    const prev = byId.get(feed.feedId)
    if (!prev || feed.timestamp > prev.timestamp) byId.set(feed.feedId, feed)
  }
  return [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function queryCharge(
  feed: Pick<FeedListing, 'queryPriceSats'>,
  sub: FeedSub | null
): { paidSats: number, mode: ReadingMode } {
  if (sub) return { paidSats: 0, mode: 'sub' }
  return { paidSats: feed.queryPriceSats, mode: 'query' }
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

function textFields(parts: string[]): number[][] {
  return parts.map((part) => stringToUtf8Bytes(part))
}

export function encodeFeedFields(
  item: Omit<FeedListing, 'magic' | 'version' | 'kind'>
): number[][] {
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'feed',
    item.feedId,
    item.publisher,
    item.label,
    item.metricType,
    item.unit,
    String(item.queryPriceSats),
    String(item.subPriceSats),
    String(item.subHours),
    item.valueHash,
    item.timestamp
  ])
}

export function encodePulseFields(
  item: Omit<FeedPulse, 'magic' | 'version' | 'kind'>
): number[][] {
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'pulse',
    item.feedId,
    item.publisher,
    item.valueHash,
    item.timestamp
  ])
}

export function encodeSubFields(
  item: Omit<FeedSub, 'magic' | 'version' | 'kind'>
): number[][] {
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'sub',
    item.feedId,
    item.buyer,
    String(item.paidSats),
    item.expires,
    item.timestamp
  ])
}

export function encodeQueryFields(
  item: Omit<FeedQuery, 'magic' | 'version' | 'kind'>
): number[][] {
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'query',
    item.feedId,
    item.buyer,
    String(item.paidSats),
    item.valueHash,
    item.timestamp
  ])
}

export function encodeReadingFields(
  item: Omit<FeedReading, 'magic' | 'version' | 'kind'>
): number[][] {
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'reading',
    item.feedId,
    item.buyer,
    item.label,
    item.metricType,
    item.value,
    item.unit,
    String(item.paidSats),
    item.mode,
    item.valueHash,
    item.timestamp
  ])
}

function at(fields: Array<number[] | Uint8Array>, index: number): string {
  return fieldUtf8(fields[index])
}

export function isIsoTime(value: string): boolean {
  if (!ISO_TIME.test(value)) return false
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return !Number.isNaN(date.getTime())
}

export function validatePrice(sats: number, allowZero = false): string | null {
  if (!Number.isInteger(sats)) return 'price must be a whole number of sats'
  if (sats < (allowZero ? 0 : PRICE_MIN)) {
    return allowZero ? 'price must be zero or more' : 'price must be at least 1 sat'
  }
  if (sats > PRICE_MAX) return 'price is too high for v0'
  return null
}

export function validateLabel(label: string): string | null {
  if (label.trim().length < 1) return 'label is required'
  if (label.length > LABEL_MAX) return 'label too long'
  if (label.includes('\n')) return 'label must be one line'
  return null
}

export function validateReadingValue(value: string): string | null {
  if (value.trim().length < 1) return 'reading is required'
  if (value.length > VALUE_MAX) return 'reading too long for v0'
  if (value.includes('\n')) return 'reading must be one line'
  return null
}

export function validateUnit(unit: string): string | null {
  if (unit.length > UNIT_MAX) return 'unit too long'
  if (unit.includes('\n')) return 'unit must be one line'
  return null
}

export function validateListing(item: FeedListing): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'feed') return 'kind must be feed'
  if (!HASH_HEX.test(item.feedId)) return 'feed id must be 64 hex chars'
  if (!isIdentityKey(item.publisher)) return 'publisher must be an identity key'
  const labelError = validateLabel(item.label)
  if (labelError) return labelError
  if (!isMetricType(item.metricType)) return 'metric type is not supported'
  const unitError = validateUnit(item.unit)
  if (unitError) return unitError
  const priceError = validatePrice(item.queryPriceSats)
  if (priceError) return priceError
  const subError = validatePrice(item.subPriceSats, true)
  if (subError) return subError
  if (!Number.isInteger(item.subHours) || item.subHours < 0) return 'subscription hours must be a whole number'
  if (item.subPriceSats === 0) {
    if (item.subHours !== 0) return 'subscription hours require a subscription price'
  } else if (item.subHours < 1 || item.subHours > SUB_HOURS_MAX) {
    return 'subscription is too long for v0'
  }
  if (!HASH_HEX.test(item.valueHash)) return 'reading hash must be 64 hex chars'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validatePulse(item: FeedPulse): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'pulse') return 'kind must be pulse'
  if (!HASH_HEX.test(item.feedId)) return 'feed id must be 64 hex chars'
  if (!isIdentityKey(item.publisher)) return 'publisher must be an identity key'
  if (!HASH_HEX.test(item.valueHash)) return 'reading hash must be 64 hex chars'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validateSub(item: FeedSub): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'sub') return 'kind must be sub'
  if (!HASH_HEX.test(item.feedId)) return 'feed id must be 64 hex chars'
  if (!isIdentityKey(item.buyer)) return 'buyer must be an identity key'
  const priceError = validatePrice(item.paidSats)
  if (priceError) return priceError
  if (!isIsoTime(item.expires)) return 'expiry must be ISO-8601'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  if (new Date(item.expires).getTime() <= new Date(item.timestamp).getTime()) {
    return 'subscription must expire after it opens'
  }
  return null
}

export function validateQuery(item: FeedQuery): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'query') return 'kind must be query'
  if (!HASH_HEX.test(item.feedId)) return 'feed id must be 64 hex chars'
  if (!isIdentityKey(item.buyer)) return 'buyer must be an identity key'
  const priceError = validatePrice(item.paidSats)
  if (priceError) return priceError
  if (!HASH_HEX.test(item.valueHash)) return 'reading hash must be 64 hex chars'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validateReading(item: FeedReading): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'reading') return 'kind must be reading'
  if (!HASH_HEX.test(item.feedId)) return 'feed id must be 64 hex chars'
  if (!isIdentityKey(item.buyer)) return 'buyer must be an identity key'
  const labelError = validateLabel(item.label)
  if (labelError) return labelError
  if (!isMetricType(item.metricType)) return 'metric type is not supported'
  const valueError = validateReadingValue(item.value)
  if (valueError) return valueError
  const unitError = validateUnit(item.unit)
  if (unitError) return unitError
  if (!isReadingMode(item.mode)) return 'mode must be query or sub'
  if (!Number.isInteger(item.paidSats) || item.paidSats < 0 || item.paidSats > PRICE_MAX) {
    return 'paid must be a whole number of sats'
  }
  if (item.mode === 'query' && item.paidSats < PRICE_MIN) return 'a query payment is required'
  if (!HASH_HEX.test(item.valueHash)) return 'reading hash must be 64 hex chars'
  const expected = readingHash(item)
  if (item.valueHash !== expected) return 'reading hash does not match the value'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

function listingFromFields(fields: Array<number[] | Uint8Array>, start: number): FeedListing | null {
  if (start + 12 >= fields.length) return null
  const metricType = at(fields, start + 6)
  if (!isMetricType(metricType)) return null
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'feed',
    feedId: at(fields, start + 3),
    publisher: at(fields, start + 4),
    label: at(fields, start + 5),
    metricType,
    unit: at(fields, start + 7),
    queryPriceSats: Number(at(fields, start + 8)),
    subPriceSats: Number(at(fields, start + 9)),
    subHours: Number(at(fields, start + 10)),
    valueHash: at(fields, start + 11).toLowerCase(),
    timestamp: at(fields, start + 12)
  }
}

function pulseFromFields(fields: Array<number[] | Uint8Array>, start: number): FeedPulse | null {
  if (start + 6 >= fields.length) return null
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'pulse',
    feedId: at(fields, start + 3),
    publisher: at(fields, start + 4),
    valueHash: at(fields, start + 5).toLowerCase(),
    timestamp: at(fields, start + 6)
  }
}

function subFromFields(fields: Array<number[] | Uint8Array>, start: number): FeedSub | null {
  if (start + 7 >= fields.length) return null
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'sub',
    feedId: at(fields, start + 3),
    buyer: at(fields, start + 4),
    paidSats: Number(at(fields, start + 5)),
    expires: at(fields, start + 6),
    timestamp: at(fields, start + 7)
  }
}

function queryFromFields(fields: Array<number[] | Uint8Array>, start: number): FeedQuery | null {
  if (start + 7 >= fields.length) return null
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'query',
    feedId: at(fields, start + 3),
    buyer: at(fields, start + 4),
    paidSats: Number(at(fields, start + 5)),
    valueHash: at(fields, start + 6).toLowerCase(),
    timestamp: at(fields, start + 7)
  }
}

function readingFromFields(fields: Array<number[] | Uint8Array>, start: number): FeedReading | null {
  if (start + 12 >= fields.length) return null
  const metricType = at(fields, start + 6)
  const mode = at(fields, start + 10)
  if (!isMetricType(metricType) || !isReadingMode(mode)) return null
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'reading',
    feedId: at(fields, start + 3),
    buyer: at(fields, start + 4),
    label: at(fields, start + 5),
    metricType,
    value: at(fields, start + 7),
    unit: at(fields, start + 8),
    paidSats: Number(at(fields, start + 9)),
    mode,
    valueHash: at(fields, start + 11).toLowerCase(),
    timestamp: at(fields, start + 12)
  }
}

/**
 * Accepts live lock() scripts where MAGIC is anywhere in the field list.
 * The feed row never returns the plaintext reading. A reading receipt does.
 */
export function parseFeedFields(fields: Array<number[] | Uint8Array>): FeedPayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  try {
    if (at(fields, start) !== MAGIC) return null
    if (at(fields, start + 1) !== SCHEMA_VERSION) return null
    const kind = at(fields, start + 2)
    if (kind === 'feed') {
      const parsed = listingFromFields(fields, start)
      if (!parsed || validateListing(parsed)) return null
      return parsed
    }
    if (kind === 'pulse') {
      const parsed = pulseFromFields(fields, start)
      if (!parsed || validatePulse(parsed)) return null
      return parsed
    }
    if (kind === 'sub') {
      const parsed = subFromFields(fields, start)
      if (!parsed || validateSub(parsed)) return null
      return parsed
    }
    if (kind === 'query') {
      const parsed = queryFromFields(fields, start)
      if (!parsed || validateQuery(parsed)) return null
      return parsed
    }
    if (kind === 'reading') {
      const parsed = readingFromFields(fields, start)
      if (!parsed || validateReading(parsed)) return null
      return parsed
    }
    return null
  } catch {
    return null
  }
}
