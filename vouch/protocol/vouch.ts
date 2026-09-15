/**
 * Vouch desk protocol (PushDrop / BRC-48 fields).
 *
 * A known party stakes a slashable bond for a supplier. Anyone can look
 * the vouch up. A paid attestation records what was checked. The voucher
 * or a designated slasher can slash on proven bad faith while the bond
 * is live. Optional release returns the bond.
 *
 * Public Pages uses tm_anytx / ls_anytx. Client filters on MAGIC `vouch`.
 * This is not a name lease, not a titled document, not a membership,
 * not a provenance receipt, and not a reputation trading market.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'vouch']
export const BASKET = 'vouch'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'vouch'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'vouch'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const LABEL_MAX = 160
export const SUBJECT_MAX = 80
export const NOTE_MAX = 4000
export const REASON_MAX = 240
export const VOUCH_ID_LEN = 16

export const FEE_SATS = 100_000
export const FEE_MIN = 1
export const FEE_MAX = 100_000_000
export const BOND_MIN = 1
export const BOND_MAX = 100_000_000
export const DEFAULT_BOND_SATS = 1_000_000
export const TOKEN_SATS = 1

export const KINDS = ['vouch', 'attest', 'slash', 'release'] as const
export type VouchKind = (typeof KINDS)[number]
export type VouchStatus = 'live' | 'slashed' | 'released'

export interface VouchToken {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'vouch'
  vouchId: string
  label: string
  subject: string
  subjectIdentity: string
  voucher: string
  slasher: string
  bondSats: number
  writeFeeSats: number
  timestamp: string
}

export interface VouchAttest {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'attest'
  vouchId: string
  attestor: string
  note: string
  noteHash: string
  writeFeeSats: number
  timestamp: string
}

export interface VouchSlash {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'slash'
  vouchId: string
  slasher: string
  reason: string
  timestamp: string
}

export interface VouchRelease {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'release'
  vouchId: string
  voucher: string
  timestamp: string
}

export type VouchPayload = VouchToken | VouchAttest | VouchSlash | VouchRelease

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const HASH_HEX = /^[0-9a-f]{64}$/
const TOKEN_HEX = /^[0-9a-f]{8,64}$/
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

export function normalizeLabel(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function normalizeSubject(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function normalizeNote(raw: string): string {
  return raw.trim()
}

export function normalizeReason(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

export function formatSats(amount: number): string {
  const n = Math.trunc(amount)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n.toLocaleString('en-US')} sats`
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

export function labelError(raw: string): string | null {
  const label = normalizeLabel(raw)
  if (!label) return 'Label is required.'
  if (label.length > LABEL_MAX) return 'Label is too long.'
  return null
}

export function subjectError(raw: string): string | null {
  const subject = normalizeSubject(raw)
  if (!subject) return 'Name the supplier.'
  if (subject.length > SUBJECT_MAX) return 'That name is too long.'
  return null
}

export function noteError(raw: string): string | null {
  const note = normalizeNote(raw)
  if (!note) return 'Say what was checked.'
  if (note.length > NOTE_MAX) return 'That note is too long for v0.'
  return null
}

export function reasonError(raw: string): string | null {
  const reason = normalizeReason(raw)
  if (!reason) return 'Say why this is slashed.'
  if (reason.length > REASON_MAX) return 'That reason is too long.'
  return null
}

export function validateFee(sats: number): string | null {
  if (!Number.isInteger(sats)) return 'Fee must be a whole number of sats.'
  if (sats < FEE_MIN) return 'Fee must be at least 1 sat.'
  if (sats > FEE_MAX) return 'Fee is too high for v0.'
  return null
}

export function validateBond(sats: number): string | null {
  if (!Number.isInteger(sats)) return 'Bond must be a whole number of sats.'
  if (sats < BOND_MIN) return 'Bond must be at least 1 sat.'
  if (sats > BOND_MAX) return 'Bond is too high for v0.'
  return null
}

export function isVouchId(value: string): boolean {
  return TOKEN_HEX.test(value.trim().toLowerCase())
}

export function looksLikeVouchQuery(raw: string): boolean {
  const q = normalizeQuery(raw)
  return TOKEN_HEX.test(q)
}

export function makeVouchId(input: {
  voucher: string
  subject: string
  timestamp: string
  nonce: string
}): string {
  return sha256Hex([
    input.voucher,
    normalizeSubject(input.subject),
    input.timestamp,
    input.nonce
  ].join('\n')).slice(0, VOUCH_ID_LEN)
}

/** Empty stays empty. 64-hex as-is. Otherwise sha256 of the pasted note. */
export function resolveNoteHash(input: string): string {
  const trimmed = input.trim()
  if (!trimmed) return ''
  const hex = trimmed.replace(/^0x/i, '').toLowerCase()
  if (HASH_HEX.test(hex) && !trimmed.includes('\n') && trimmed.length <= 66) {
    return hex
  }
  return sha256Hex(input)
}

export function isVoucher(vouch: Pick<VouchToken, 'voucher'>, identityKey: string): boolean {
  return Boolean(identityKey) && vouch.voucher === identityKey
}

export function isSlasher(vouch: Pick<VouchToken, 'slasher'>, identityKey: string): boolean {
  return Boolean(identityKey) && vouch.slasher === identityKey
}

/** Voucher or the designated slasher can slash a live bond. */
export function canSlash(vouch: Pick<VouchToken, 'voucher' | 'slasher'>, identityKey: string): boolean {
  return isVoucher(vouch, identityKey) || isSlasher(vouch, identityKey)
}

export function canRelease(vouch: Pick<VouchToken, 'voucher'>, identityKey: string): boolean {
  return isVoucher(vouch, identityKey)
}

function closedAt(
  rows: Array<Pick<VouchSlash | VouchRelease, 'vouchId' | 'timestamp'>>
): Map<string, string> {
  const closed = new Map<string, string>()
  for (const row of rows) {
    const previous = closed.get(row.vouchId)
    if (!previous || row.timestamp.localeCompare(previous) > 0) {
      closed.set(row.vouchId, row.timestamp)
    }
  }
  return closed
}

/** Latest unslashed, unreleased vouch per vouchId. */
export function currentVouches<
  T extends Pick<VouchToken, 'vouchId' | 'timestamp'>,
  C extends Pick<VouchSlash | VouchRelease, 'vouchId' | 'timestamp'>
>(rows: T[], closures: C[] = []): T[] {
  const closed = closedAt(closures)
  const latest = new Map<string, T>()
  const chronological = [...rows].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  for (const row of chronological) {
    latest.set(row.vouchId, row)
  }
  return [...latest.values()]
    .filter((row) => {
      const ended = closed.get(row.vouchId)
      return !ended || ended.localeCompare(row.timestamp) < 0
    })
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function liveBond(
  vouch: Pick<VouchToken, 'vouchId' | 'timestamp'>,
  closures: Array<Pick<VouchSlash | VouchRelease, 'vouchId' | 'timestamp'>> = []
): boolean {
  return currentVouches([vouch], closures).some((row) => row.vouchId === vouch.vouchId)
}

export function vouchStatus(
  vouch: Pick<VouchToken, 'vouchId' | 'timestamp'> | null,
  slashes: Array<Pick<VouchSlash, 'vouchId' | 'timestamp'>> = [],
  releases: Array<Pick<VouchRelease, 'vouchId' | 'timestamp'>> = []
): VouchStatus | 'none' {
  if (!vouch) return 'none'
  const slash = slashes
    .filter((row) => row.vouchId === vouch.vouchId && row.timestamp.localeCompare(vouch.timestamp) >= 0)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  const release = releases
    .filter((row) => row.vouchId === vouch.vouchId && row.timestamp.localeCompare(vouch.timestamp) >= 0)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]
  if (slash && release) {
    return slash.timestamp.localeCompare(release.timestamp) >= 0 ? 'slashed' : 'released'
  }
  if (slash) return 'slashed'
  if (release) return 'released'
  return 'live'
}

export function matchVouches(
  vouches: VouchToken[],
  query: string
): VouchToken[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const idQuery = looksLikeVouchQuery(q)
  const found = vouches.filter((row) => {
    if (idQuery) {
      return row.vouchId === q || row.vouchId.startsWith(q) || q.startsWith(row.vouchId)
    }
    const label = normalizeQuery(row.label)
    const subject = normalizeQuery(row.subject)
    return label === q || label.includes(q) || subject === q || subject.includes(q)
  })
  return [...found].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function selectVouch(vouches: VouchToken[], query: string): VouchToken | null {
  const matches = matchVouches(vouches, query)
  return matches[0] ?? null
}

export function matchAttests(
  attests: VouchAttest[],
  query: string
): VouchAttest[] {
  const q = normalizeQuery(query)
  if (!q) return []
  const idQuery = looksLikeVouchQuery(q)
  const found = attests.filter((row) => {
    if (idQuery) {
      return row.vouchId === q || row.vouchId.startsWith(q) || q.startsWith(row.vouchId)
    }
    const note = normalizeQuery(row.note)
    return note === q || note.includes(q)
  })
  return [...found].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
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

export function validateVouch(item: VouchToken): string | null {
  if (item.magic !== MAGIC) return 'Not a vouch.'
  if (item.version !== SCHEMA_VERSION) return 'Unsupported schema version.'
  if (item.kind !== 'vouch') return 'Kind must be vouch.'
  if (!isVouchId(item.vouchId) || item.vouchId.length !== VOUCH_ID_LEN) {
    return 'Vouch id must be 16 hex chars.'
  }
  const invalidLabel = labelError(item.label)
  if (invalidLabel) return invalidLabel
  if (item.label !== normalizeLabel(item.label)) return 'Label must be normalized.'
  const invalidSubject = subjectError(item.subject)
  if (invalidSubject) return invalidSubject
  if (item.subject !== normalizeSubject(item.subject)) return 'Subject must be normalized.'
  if (item.subjectIdentity && !isIdentityKey(item.subjectIdentity)) {
    return 'Subject identity must be an identity key.'
  }
  if (!isIdentityKey(item.voucher)) return 'Voucher must be an identity key.'
  if (!isIdentityKey(item.slasher)) return 'Slasher must be an identity key.'
  const bondError = validateBond(item.bondSats)
  if (bondError) return bondError
  const feeError = validateFee(item.writeFeeSats)
  if (feeError) return feeError
  if (!isIsoDateTime(item.timestamp)) return 'Timestamp must be a date and time.'
  return null
}

export function validateAttest(item: VouchAttest): string | null {
  if (item.magic !== MAGIC) return 'Not a vouch.'
  if (item.version !== SCHEMA_VERSION) return 'Unsupported schema version.'
  if (item.kind !== 'attest') return 'Kind must be attest.'
  if (!isVouchId(item.vouchId)) return 'Vouch id is required.'
  if (!isIdentityKey(item.attestor)) return 'Attestor must be an identity key.'
  const invalidNote = noteError(item.note)
  if (invalidNote) return invalidNote
  if (item.noteHash && !HASH_HEX.test(item.noteHash)) return 'Note hash must be 64 hex chars.'
  const feeError = validateFee(item.writeFeeSats)
  if (feeError) return feeError
  if (!isIsoDateTime(item.timestamp)) return 'Timestamp must be a date and time.'
  return null
}

export function validateSlash(item: VouchSlash): string | null {
  if (item.magic !== MAGIC) return 'Not a vouch.'
  if (item.version !== SCHEMA_VERSION) return 'Unsupported schema version.'
  if (item.kind !== 'slash') return 'Kind must be slash.'
  if (!isVouchId(item.vouchId)) return 'Vouch id is required.'
  if (!isIdentityKey(item.slasher)) return 'Slasher must be an identity key.'
  const invalidReason = reasonError(item.reason)
  if (invalidReason) return invalidReason
  if (!isIsoDateTime(item.timestamp)) return 'Timestamp must be a date and time.'
  return null
}

export function validateRelease(item: VouchRelease): string | null {
  if (item.magic !== MAGIC) return 'Not a vouch.'
  if (item.version !== SCHEMA_VERSION) return 'Unsupported schema version.'
  if (item.kind !== 'release') return 'Kind must be release.'
  if (!isVouchId(item.vouchId)) return 'Vouch id is required.'
  if (!isIdentityKey(item.voucher)) return 'Voucher must be an identity key.'
  if (!isIsoDateTime(item.timestamp)) return 'Timestamp must be a date and time.'
  return null
}

export function encodeVouchFields(
  item: Omit<VouchToken, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: VouchToken = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'vouch',
    ...item
  }
  const invalid = validateVouch(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('vouch'),
    stringToUtf8Bytes(item.vouchId),
    stringToUtf8Bytes(item.label),
    stringToUtf8Bytes(item.subject),
    stringToUtf8Bytes(item.subjectIdentity),
    stringToUtf8Bytes(item.voucher),
    stringToUtf8Bytes(item.slasher),
    stringToUtf8Bytes(String(item.bondSats)),
    stringToUtf8Bytes(String(item.writeFeeSats)),
    stringToUtf8Bytes(item.timestamp)
  ]
}

export function encodeAttestFields(
  item: Omit<VouchAttest, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: VouchAttest = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'attest',
    ...item
  }
  const invalid = validateAttest(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('attest'),
    stringToUtf8Bytes(item.vouchId),
    stringToUtf8Bytes(item.attestor),
    stringToUtf8Bytes(item.note),
    stringToUtf8Bytes(item.noteHash),
    stringToUtf8Bytes(String(item.writeFeeSats)),
    stringToUtf8Bytes(item.timestamp)
  ]
}

export function encodeSlashFields(
  item: Omit<VouchSlash, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: VouchSlash = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'slash',
    ...item
  }
  const invalid = validateSlash(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('slash'),
    stringToUtf8Bytes(item.vouchId),
    stringToUtf8Bytes(item.slasher),
    stringToUtf8Bytes(item.reason),
    stringToUtf8Bytes(item.timestamp)
  ]
}

export function encodeReleaseFields(
  item: Omit<VouchRelease, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: VouchRelease = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'release',
    ...item
  }
  const invalid = validateRelease(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('release'),
    stringToUtf8Bytes(item.vouchId),
    stringToUtf8Bytes(item.voucher),
    stringToUtf8Bytes(item.timestamp)
  ]
}

function vouchFromParts(parts: {
  vouchId: string
  label: string
  subject: string
  subjectIdentity: string
  voucher: string
  slasher: string
  bondSats: number
  writeFeeSats: number
  timestamp: string
}): VouchToken | null {
  const item: VouchToken = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'vouch',
    vouchId: parts.vouchId.toLowerCase(),
    label: normalizeLabel(parts.label),
    subject: normalizeSubject(parts.subject),
    subjectIdentity: parts.subjectIdentity.trim(),
    voucher: parts.voucher,
    slasher: parts.slasher,
    bondSats: parts.bondSats,
    writeFeeSats: parts.writeFeeSats,
    timestamp: parts.timestamp
  }
  return validateVouch(item) ? null : item
}

function attestFromParts(parts: {
  vouchId: string
  attestor: string
  note: string
  noteHash: string
  writeFeeSats: number
  timestamp: string
}): VouchAttest | null {
  const item: VouchAttest = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'attest',
    vouchId: parts.vouchId.toLowerCase(),
    attestor: parts.attestor,
    note: normalizeNote(parts.note),
    noteHash: parts.noteHash.toLowerCase(),
    writeFeeSats: parts.writeFeeSats,
    timestamp: parts.timestamp
  }
  return validateAttest(item) ? null : item
}

function slashFromParts(parts: {
  vouchId: string
  slasher: string
  reason: string
  timestamp: string
}): VouchSlash | null {
  const item: VouchSlash = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'slash',
    vouchId: parts.vouchId.toLowerCase(),
    slasher: parts.slasher,
    reason: normalizeReason(parts.reason),
    timestamp: parts.timestamp
  }
  return validateSlash(item) ? null : item
}

function releaseFromParts(parts: {
  vouchId: string
  voucher: string
  timestamp: string
}): VouchRelease | null {
  const item: VouchRelease = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'release',
    vouchId: parts.vouchId.toLowerCase(),
    voucher: parts.voucher,
    timestamp: parts.timestamp
  }
  return validateRelease(item) ? null : item
}

/**
 * Accepts live lock() scripts where MAGIC is anywhere in the field list.
 * Extra pubkey/signature fields may sit before or after the row.
 */
export function parseVouchFields(fields: Array<number[] | Uint8Array>): VouchPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  try {
    const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
    if (rest.length < 3) return null
    const version = rest[0]
    const kind = rest[1]
    if (version !== SCHEMA_VERSION) return null
    if (kind === 'vouch') {
      if (rest.length < 11) return null
      const bondSats = Number(rest[8])
      const writeFeeSats = Number(rest[9])
      if (!Number.isInteger(bondSats) || !Number.isInteger(writeFeeSats)) return null
      return vouchFromParts({
        vouchId: rest[2],
        label: rest[3],
        subject: rest[4],
        subjectIdentity: rest[5],
        voucher: rest[6],
        slasher: rest[7],
        bondSats,
        writeFeeSats,
        timestamp: rest[10]
      })
    }
    if (kind === 'attest') {
      if (rest.length < 8) return null
      const writeFeeSats = Number(rest[6])
      if (!Number.isInteger(writeFeeSats)) return null
      return attestFromParts({
        vouchId: rest[2],
        attestor: rest[3],
        note: rest[4],
        noteHash: rest[5],
        writeFeeSats,
        timestamp: rest[7]
      })
    }
    if (kind === 'slash') {
      if (rest.length < 6) return null
      return slashFromParts({
        vouchId: rest[2],
        slasher: rest[3],
        reason: rest[4],
        timestamp: rest[5]
      })
    }
    if (kind === 'release') {
      if (rest.length < 5) return null
      return releaseFromParts({
        vouchId: rest[2],
        voucher: rest[3],
        timestamp: rest[4]
      })
    }
    return null
  } catch {
    return null
  }
}

export function filterVouchPayloads(payloads: VouchPayload[]): VouchPayload[] {
  return payloads.filter((payload) => {
    if (payload.magic !== MAGIC) return false
    if (payload.kind === 'vouch') return !validateVouch(payload)
    if (payload.kind === 'attest') return !validateAttest(payload)
    if (payload.kind === 'slash') return !validateSlash(payload)
    if (payload.kind === 'release') return !validateRelease(payload)
    return false
  })
}
