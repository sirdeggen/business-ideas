/**
 * Timed memberships protocol (PushDrop / BRC-48 fields).
 *
 * An org writes a membership (name, duration, price). A member pays and
 * receives a timed key announcement. Show compares now to expiry — it does
 * not spend the key. Renew pays again and extends expiry.
 *
 * Public Pages uses tm_anytx / ls_anytx. Client filters on MAGIC.
 * Not event tickets. Not a one-night spend-to-redeem.
 */

export const PROTOCOL_ID: [0, string] = [0, 'membership']
export const BASKET = 'membership'
export const MAGIC = 'membership'
export const SCHEMA_VERSION = '1'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']

export const NAME_MAX = 80
export const MIN_AMOUNT_SATS = 1
export const MAX_AMOUNT_SATS = 1_000_000_000_000
export const DEFAULT_NAME = 'Gym month'
export const DEFAULT_DURATION_DAYS = 30
export const DEFAULT_PRICE_SATS = 50_000
export const MIN_DURATION_SEC = 1
export const MAX_DURATION_SEC = 3650 * 86_400

export const KINDS = ['def', 'key'] as const
export type MembershipKind = (typeof KINDS)[number]

export type SheetTitle = 'Membership' | 'Show' | 'Renew'
export type KeyStatus = 'valid' | 'expired'

export interface MembershipDef {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'def'
  membershipId: string
  name: string
  durationSec: number
  priceSats: number
  issuerIdentity: string
  createdAt: string
}

export interface MembershipKey {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'key'
  membershipId: string
  memberIdentity: string
  issuedAt: string
  durationSec: number
  expiresAt: string
  issuerIdentity: string
}

export type MembershipPayload = MembershipDef | MembershipKey

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const MEMBERSHIP_ID = /^[0-9a-f]{32}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isMembershipId(value: string): boolean {
  return MEMBERSHIP_ID.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function newMembershipId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function assertAmountSats(amountSats: number): void {
  if (!Number.isInteger(amountSats) || amountSats < MIN_AMOUNT_SATS || amountSats > MAX_AMOUNT_SATS) {
    throw new Error(`Price must be an integer between ${MIN_AMOUNT_SATS} and ${MAX_AMOUNT_SATS} sats`)
  }
}

export function assertDurationSec(durationSec: number): void {
  if (!Number.isInteger(durationSec) || durationSec < MIN_DURATION_SEC || durationSec > MAX_DURATION_SEC) {
    throw new Error('Duration should be at least one second.')
  }
}

export function assertName(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name is required.')
  if (trimmed.length > NAME_MAX) {
    throw new Error(`Name must be at most ${NAME_MAX} characters.`)
  }
}

export function daysToSec(days: number): number {
  if (!Number.isFinite(days) || days <= 0) {
    throw new Error('Duration should be at least one day.')
  }
  return Math.round(days * 86_400)
}

export function expiresAtFrom(issuedAt: string, durationSec: number): string {
  const start = Date.parse(issuedAt)
  if (!Number.isFinite(start)) throw new Error('Issued time is missing.')
  assertDurationSec(durationSec)
  return nowIso(new Date(start + durationSec * 1000))
}

/** Renew extends from the later of now and the previous expiry. */
export function renewExpiry(prevExpiresAt: string, durationSec: number, nowMs = Date.now()): string {
  assertDurationSec(durationSec)
  const prev = Date.parse(prevExpiresAt)
  const base = Number.isFinite(prev) ? Math.max(nowMs, prev) : nowMs
  return nowIso(new Date(base + durationSec * 1000))
}

export function keyStatus(key: Pick<MembershipKey, 'expiresAt'>, nowMs = Date.now()): KeyStatus {
  const expiresAtMs = Date.parse(key.expiresAt)
  if (!Number.isFinite(expiresAtMs) || nowMs >= expiresAtMs) return 'expired'
  return 'valid'
}

export function isKeyValid(key: Pick<MembershipKey, 'expiresAt'>, nowMs = Date.now()): boolean {
  return keyStatus(key, nowMs) === 'valid'
}

export function sheetTitle(state: {
  membership: boolean
  key: boolean
  valid: boolean
}): SheetTitle {
  if (!state.membership || !state.key) return 'Membership'
  return state.valid ? 'Show' : 'Renew'
}

export function latestKey(keys: MembershipKey[]): MembershipKey | null {
  if (keys.length === 0) return null
  return keys.reduce((best, row) => {
    const bestIssued = Date.parse(best.issuedAt)
    const rowIssued = Date.parse(row.issuedAt)
    if (rowIssued > bestIssued) return row
    if (rowIssued === bestIssued && Date.parse(row.expiresAt) > Date.parse(best.expiresAt)) {
      return row
    }
    return best
  })
}

export function selectShowKey<T extends MembershipKey & { txid?: string }>(
  keys: T[],
  hintTxid?: string
): T | null {
  if (keys.length === 0) return null
  if (hintTxid) {
    const hint = keys.find((row) => row.txid === hintTxid)
    if (hint) {
      const sameMember = keys.filter((row) => row.memberIdentity === hint.memberIdentity)
      return latestKey(sameMember) as T | null
    }
  }
  return null
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

export function validateDef(def: MembershipDef): string | null {
  if (def.magic !== MAGIC) return 'Not a membership.'
  if (def.kind !== 'def') return 'Not a membership record.'
  if (!isMembershipId(def.membershipId)) return 'Membership id is missing.'
  try {
    assertName(def.name)
  } catch (error) {
    return error instanceof Error ? error.message : 'Name is invalid.'
  }
  try {
    assertDurationSec(def.durationSec)
  } catch (error) {
    return error instanceof Error ? error.message : 'Duration is invalid.'
  }
  try {
    assertAmountSats(def.priceSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Price is invalid.'
  }
  if (!isIdentityKey(def.issuerIdentity)) return 'Issuer identity is missing.'
  if (!isIsoDateTime(def.createdAt)) return 'Created time is missing.'
  return null
}

export function validateKey(key: MembershipKey): string | null {
  if (key.magic !== MAGIC) return 'Not a membership.'
  if (key.kind !== 'key') return 'Not a key record.'
  if (!isMembershipId(key.membershipId)) return 'Membership id is missing.'
  if (!isIdentityKey(key.memberIdentity)) return 'Member identity is missing.'
  if (!isIdentityKey(key.issuerIdentity)) return 'Issuer identity is missing.'
  try {
    assertDurationSec(key.durationSec)
  } catch (error) {
    return error instanceof Error ? error.message : 'Duration is invalid.'
  }
  if (!isIsoDateTime(key.issuedAt)) return 'Issued time is missing.'
  if (!isIsoDateTime(key.expiresAt)) return 'Expiry is missing.'
  return null
}

export function encodeDefFields(def: Omit<MembershipDef, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: MembershipDef = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'def',
    ...def
  }
  const invalid = validateDef(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('def'),
    stringToUtf8Bytes(def.membershipId),
    stringToUtf8Bytes(def.name.trim()),
    stringToUtf8Bytes(String(def.durationSec)),
    stringToUtf8Bytes(String(def.priceSats)),
    stringToUtf8Bytes(def.issuerIdentity),
    stringToUtf8Bytes(def.createdAt)
  ]
}

export function encodeKeyFields(key: Omit<MembershipKey, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: MembershipKey = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'key',
    ...key
  }
  const invalid = validateKey(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('key'),
    stringToUtf8Bytes(key.membershipId),
    stringToUtf8Bytes(key.memberIdentity),
    stringToUtf8Bytes(key.issuedAt),
    stringToUtf8Bytes(String(key.durationSec)),
    stringToUtf8Bytes(key.expiresAt),
    stringToUtf8Bytes(key.issuerIdentity)
  ]
}

function defFromParts(parts: Omit<MembershipDef, 'magic' | 'version' | 'kind'>): MembershipDef | null {
  const def: MembershipDef = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'def',
    ...parts
  }
  return validateDef(def) ? null : def
}

function keyFromParts(parts: Omit<MembershipKey, 'magic' | 'version' | 'kind'>): MembershipKey | null {
  const key: MembershipKey = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'key',
    ...parts
  }
  return validateKey(key) ? null : key
}

export function parseMembershipFields(fields: Array<number[] | Uint8Array>): MembershipPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION) return null
  if (kind === 'def') {
    if (rest.length < 8) return null
    const durationSec = Number(rest[4])
    const priceSats = Number(rest[5])
    if (!Number.isInteger(durationSec) || !Number.isInteger(priceSats)) return null
    return defFromParts({
      membershipId: rest[2],
      name: rest[3],
      durationSec,
      priceSats,
      issuerIdentity: rest[6],
      createdAt: rest[7]
    })
  }
  if (kind === 'key') {
    if (rest.length < 8) return null
    const durationSec = Number(rest[5])
    if (!Number.isInteger(durationSec)) return null
    return keyFromParts({
      membershipId: rest[2],
      memberIdentity: rest[3],
      issuedAt: rest[4],
      durationSec,
      expiresAt: rest[6],
      issuerIdentity: rest[7]
    })
  }
  return null
}

export function durationLabel(durationSec: number): string {
  if (!(durationSec > 0)) return ''
  if (durationSec % 86_400 === 0) {
    const days = durationSec / 86_400
    return days === 1 ? '1 day' : `${days.toLocaleString('en-US')} days`
  }
  if (durationSec % 3600 === 0) {
    const hours = durationSec / 3600
    return hours === 1 ? '1 hour' : `${hours.toLocaleString('en-US')} hours`
  }
  if (durationSec % 60 === 0) {
    const minutes = durationSec / 60
    return minutes === 1 ? '1 minute' : `${minutes.toLocaleString('en-US')} minutes`
  }
  return durationSec === 1 ? '1 second' : `${durationSec.toLocaleString('en-US')} seconds`
}
