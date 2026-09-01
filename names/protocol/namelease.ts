/**
 * Name lease protocol (PushDrop / BRC-48 fields).
 *
 * Register a human name for a period with a sat payment. Look it up
 * on overlay by name. Renew before expiry. After expiry the name is
 * free again. One active lease per name.
 *
 * Public Pages uses tm_anytx / ls_anytx. Client filters on MAGIC
 * `namelease`. Do not reuse invoices, session-ap, spend-policy, or
 * datasets MAGIC. This is not ENS, not a contacts list, and not invoices.
 */

export const PROTOCOL_ID: [0, string] = [0, 'namelease']
export const BASKET = 'namelease'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'namelease'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'namelease'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const NAME_MAX = 16
export const PERIODS = [30, 90, 365] as const
export type PeriodDays = (typeof PERIODS)[number]

export const KINDS = ['register', 'renew'] as const
export type NameLeaseKind = (typeof KINDS)[number]

export interface NameLease {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: NameLeaseKind
  name: string
  lessee: string
  registeredAt: string
  expiresAt: string
  periodDays: number
  amountSats: number
  previousExpiry?: string
}

export type LeaseDecision =
  | { ok: true, kind: 'register' }
  | { ok: true, kind: 'renew', previousExpiry: string }
  | { ok: false, reason: string }

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const NAME_CHARS = /^[a-z0-9](?:[a-z0-9-]{0,14}[a-z0-9])?$/

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

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function normalizeName(raw: string): string {
  return raw.trim().toLowerCase()
}

export function nameError(raw: string): string | null {
  const name = normalizeName(raw)
  if (!name) return 'Enter a name.'
  if (name.length > NAME_MAX) return 'That name is too long.'
  if (!/^[a-z0-9-]+$/.test(name)) return 'Use lowercase letters, digits, and hyphen.'
  if (name.startsWith('-') || name.endsWith('-')) return 'A name cannot start or end with a hyphen.'
  if (!NAME_CHARS.test(name)) return 'Use lowercase letters, digits, and hyphen.'
  return null
}

export function assertName(raw: string): string {
  const name = normalizeName(raw)
  const invalid = nameError(name)
  if (invalid) throw new Error(invalid)
  return name
}

export function isPeriodDays(value: number): value is PeriodDays {
  return (PERIODS as readonly number[]).includes(value)
}

export function assertPeriodDays(periodDays: number): PeriodDays {
  if (!isPeriodDays(periodDays)) {
    throw new Error('Pick 30, 90, or 365 days.')
  }
  return periodDays
}

/** Short names cost more per day. Longer names are cheaper. */
export function satsPerDay(name: string): number {
  const length = normalizeName(name).length
  if (length <= 3) return 100
  if (length <= 6) return 40
  return 10
}

export function leasePriceSats(name: string, periodDays: number): number {
  const days = assertPeriodDays(periodDays)
  const valid = assertName(name)
  return satsPerDay(valid) * days
}

export function formatSats(amount: number): string {
  const n = Math.trunc(amount)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n.toLocaleString('en-US')} sats`
}

export function addUtcDays(from: Date, days: number): string {
  const next = new Date(from.getTime())
  next.setUTCDate(next.getUTCDate() + days)
  return next.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function isExpired(expiresAt: string, now: Date): boolean {
  const expiry = new Date(expiresAt)
  if (Number.isNaN(expiry.getTime())) return true
  return now.getTime() >= expiry.getTime()
}

/** Renew adds the new period onto the current expiry so leftover time is kept. */
export function extendExpiry(
  currentExpiry: string | null | undefined,
  periodDays: number,
  now: Date
): string {
  const days = assertPeriodDays(periodDays)
  const start = currentExpiry && !isExpired(currentExpiry, now)
    ? new Date(currentExpiry)
    : now
  return addUtcDays(start, days)
}

export function sameLessee(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function selectCurrentLease(
  leases: NameLease[],
  name: string,
  now: Date
): NameLease | null {
  const normalized = normalizeName(name)
  const active = leases.filter((lease) => (
    lease.name === normalized && !isExpired(lease.expiresAt, now)
  ))
  if (active.length === 0) return null
  return [...active].sort((a, b) => {
    const expiry = b.expiresAt.localeCompare(a.expiresAt)
    if (expiry !== 0) return expiry
    return b.registeredAt.localeCompare(a.registeredAt)
  })[0]
}

export function decideLease(input: {
  current: NameLease | null
  lessee: string
  now: Date
}): LeaseDecision {
  if (!input.current || isExpired(input.current.expiresAt, input.now)) {
    return { ok: true, kind: 'register' }
  }
  if (sameLessee(input.current.lessee, input.lessee)) {
    return { ok: true, kind: 'renew', previousExpiry: input.current.expiresAt }
  }
  return { ok: false, reason: 'That name is leased.' }
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

export function validateLease(lease: NameLease): string | null {
  if (lease.magic !== MAGIC) return 'Not a name lease.'
  if (lease.version !== SCHEMA_VERSION) return 'Unsupported schema version.'
  if (lease.kind !== 'register' && lease.kind !== 'renew') return 'Kind must be register or renew.'
  const invalidName = nameError(lease.name)
  if (invalidName) return invalidName
  if (lease.name !== normalizeName(lease.name)) return 'Name must be normalized.'
  if (!isIdentityKey(lease.lessee)) return 'Lessee identity is missing.'
  if (!isIsoDateTime(lease.registeredAt)) return 'Registered time is missing.'
  if (!isIsoDateTime(lease.expiresAt)) return 'Expiry must be a date and time.'
  if (!isPeriodDays(lease.periodDays)) return 'Pick 30, 90, or 365 days.'
  if (!Number.isInteger(lease.amountSats) || lease.amountSats < 1) {
    return 'Amount must be a whole number of sats.'
  }
  if (lease.kind === 'renew') {
    if (!lease.previousExpiry || !isIsoDateTime(lease.previousExpiry)) {
      return 'Renewal needs the previous expiry.'
    }
  }
  return null
}

export function encodeLeaseFields(
  lease: Omit<NameLease, 'magic' | 'version'>
): number[][] {
  const payload: NameLease = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    ...lease
  }
  const invalid = validateLease(payload)
  if (invalid) throw new Error(invalid)
  const fields = [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(lease.kind),
    stringToUtf8Bytes(lease.name),
    stringToUtf8Bytes(lease.lessee),
    stringToUtf8Bytes(lease.registeredAt),
    stringToUtf8Bytes(lease.expiresAt),
    stringToUtf8Bytes(String(lease.periodDays)),
    stringToUtf8Bytes(String(lease.amountSats))
  ]
  if (lease.kind === 'renew' && lease.previousExpiry) {
    fields.push(stringToUtf8Bytes(lease.previousExpiry))
  }
  return fields
}

function leaseFromParts(parts: {
  kind: string
  name: string
  lessee: string
  registeredAt: string
  expiresAt: string
  periodDays: number
  amountSats: number
  previousExpiry?: string
}): NameLease | null {
  if (parts.kind !== 'register' && parts.kind !== 'renew') return null
  const lease: NameLease = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: parts.kind,
    name: normalizeName(parts.name),
    lessee: parts.lessee,
    registeredAt: parts.registeredAt,
    expiresAt: parts.expiresAt,
    periodDays: parts.periodDays,
    amountSats: parts.amountSats
  }
  if (parts.previousExpiry) lease.previousExpiry = parts.previousExpiry
  return validateLease(lease) ? null : lease
}

export function parseNameLeaseFields(fields: Array<number[] | Uint8Array>): NameLease | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 8) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION) return null
  const periodDays = Number(rest[6])
  const amountSats = Number(rest[7])
  if (!Number.isInteger(periodDays) || !Number.isInteger(amountSats)) return null
  return leaseFromParts({
    kind,
    name: rest[2],
    lessee: rest[3],
    registeredAt: rest[4],
    expiresAt: rest[5],
    periodDays,
    amountSats,
    previousExpiry: rest[8] || undefined
  })
}

export function filterNameLeasePayloads(payloads: NameLease[]): NameLease[] {
  return payloads.filter((payload) => payload.magic === MAGIC && !validateLease(payload))
}

export function formatExpiry(expiresAt: string): string {
  const date = new Date(expiresAt)
  if (Number.isNaN(date.getTime())) return expiresAt
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  })
}
