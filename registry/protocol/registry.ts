import { sha256Hex } from './sha256'

/**
 * Registry desk protocol (PushDrop / BRC-48 fields).
 *
 * A named share register: create the book, issue units to a holder,
 * transfer units with a paid attestation, export a current reading.
 * MAGIC `registry`. Public Pages uses tm_anytx / ls_anytx.
 * Client filters on MAGIC.
 *
 * Transfer-agent book for co-ops, HOAs, clubs, and small funds.
 * Not Titles (document title). Not Handoff (secondary market).
 */

export const PROTOCOL_ID: [0, string] = [0, 'registry']
export const BASKET = 'registry'
export const MAGIC = 'registry'
export const SCHEMA_VERSION = '1'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MESSAGE_BOX = 'registry'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const NAME_MAX = 80
export const NOTE_MAX = 160
export const UNIT_LABEL_MAX = 24
export const MIN_UNITS = 1
export const MAX_UNITS = 1_000_000_000_000
/** Flat protocol fee collected on every transfer. */
export const TRANSFER_FEE_SATS = 100
/** Marked on the register. v0 does not collect this subscription. */
export const AUM_SUBSCRIPTION_SATS = 10_000
export const REGISTER_SATS = 1
export const ISSUE_SATS = 1
export const ATTEST_SATS = 1

export const DEFAULT_REGISTER_NAME = 'HOA unit ledger'
export const DEFAULT_UNIT_LABEL = 'units'

export const KINDS = ['register', 'issue', 'transfer'] as const
export type RegistryKind = (typeof KINDS)[number]

export interface RegisterRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'register'
  registerId: string
  name: string
  unitLabel: string
  totalUnits: number | null
  aumNote: string
  admin: string
  createdAt: string
}

export interface IssueRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'issue'
  registerId: string
  issueId: string
  holder: string
  units: number
  admin: string
  issuedAt: string
}

export interface TransferRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'transfer'
  registerId: string
  transferId: string
  from: string
  to: string
  units: number
  feeSats: number
  protocolFeeSats: number
  actor: string
  transferredAt: string
}

export type RegistryPayload = RegisterRecord | IssueRecord | TransferRecord

export interface HoldingLine {
  holder: string
  units: number
}

export interface FoldResult {
  holdings: HoldingLine[]
  issuedUnits: number
  acceptedTransfers: number
  skippedIssues: number
  skippedTransfers: number
}

export interface RegisterReading {
  kind: 'register-reading'
  name: string
  unitLabel: string
  registerId: string
  totalUnits: number | null
  aumNote: string
  admin: string
  issuedUnits: number
  transferCount: number
  holdings: HoldingLine[]
  exportedAt: string
}

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const REGISTER_ID = /^[0-9a-f]{32}$/
const RECORD_ID = /^[0-9a-f]{64}$/
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

export function isRegisterId(value: string): boolean {
  return REGISTER_ID.test(value.trim().toLowerCase())
}

export function isRecordId(value: string): boolean {
  return RECORD_ID.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function newRegisterId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function assertName(value: string, label: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(`${label} is required.`)
  if (trimmed.length > NAME_MAX) {
    throw new Error(`${label} must be at most ${NAME_MAX} characters.`)
  }
  return trimmed
}

export function assertUnitLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Unit label is required.')
  if (trimmed.length > UNIT_LABEL_MAX) {
    throw new Error(`Unit label must be at most ${UNIT_LABEL_MAX} characters.`)
  }
  if (/[\r\n]/.test(trimmed)) throw new Error('Unit label is invalid.')
  return trimmed
}

export function assertNote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length > NOTE_MAX) {
    throw new Error(`AUM note must be at most ${NOTE_MAX} characters.`)
  }
  return trimmed
}

export function parseUnits(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < MIN_UNITS || value > MAX_UNITS) return null
    return value
  }
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < MIN_UNITS || parsed > MAX_UNITS) return null
  return parsed
}

/** Empty means no cap. Invalid text is rejected by the caller. */
export function parseTotalUnits(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return null
  const parsed = parseUnits(trimmed)
  if (parsed === null) throw new Error('Total units must be a whole number.')
  return parsed
}

export function resolveHolderRef(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (isIdentityKey(trimmed)) return trimmed
  const candidates: string[] = []
  const queryIndex = trimmed.indexOf('?')
  const hashIndex = trimmed.indexOf('#')
  if (queryIndex >= 0) candidates.push(trimmed.slice(queryIndex + 1))
  if (hashIndex >= 0) {
    const hash = trimmed.slice(hashIndex + 1)
    candidates.push(hash)
    const nested = hash.indexOf('?')
    if (nested >= 0) candidates.push(hash.slice(nested + 1))
  }
  candidates.push(trimmed)
  for (const candidate of candidates) {
    const body = candidate.startsWith('?') ? candidate.slice(1) : candidate
    const params = new URLSearchParams(body)
    for (const key of ['k', 'holder', 'identity']) {
      const value = (params.get(key) ?? '').trim()
      if (isIdentityKey(value)) return value
    }
  }
  return null
}

export function makeIssueId(
  registerId: string,
  holder: string,
  units: number,
  issuedAt: string,
  nonce: string
): string {
  return sha256Hex(['issue', registerId, holder, String(units), issuedAt, nonce].join('\n'))
}

export function makeTransferId(
  registerId: string,
  from: string,
  to: string,
  units: number,
  transferredAt: string,
  nonce: string
): string {
  return sha256Hex(['transfer', registerId, from, to, String(units), transferredAt, nonce].join('\n'))
}

export function formatSats(sats: number): string {
  const n = Math.trunc(sats)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n.toLocaleString('en-US')} sats`
}

export function formatUnits(units: number): string {
  return Math.trunc(units).toLocaleString('en-US')
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function isAdmin(register: Pick<RegisterRecord, 'admin'>, identityKey: string): boolean {
  return sameIdentity(register.admin, identityKey)
}

export function holderBalance(holdings: HoldingLine[], holder: string): number {
  return holdings.find((line) => sameIdentity(line.holder, holder))?.units ?? 0
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

export function validateRegister(record: RegisterRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a registry record.'
  if (record.kind !== 'register') return 'Not a register record.'
  if (!isRegisterId(record.registerId)) return 'Register id is missing.'
  try {
    assertName(record.name, 'Register name')
  } catch (error) {
    return error instanceof Error ? error.message : 'Register name is invalid.'
  }
  try {
    assertUnitLabel(record.unitLabel)
  } catch (error) {
    return error instanceof Error ? error.message : 'Unit label is invalid.'
  }
  if (record.totalUnits !== null && parseUnits(record.totalUnits) !== record.totalUnits) {
    return 'Total units must be a whole number.'
  }
  try {
    assertNote(record.aumNote)
  } catch (error) {
    return error instanceof Error ? error.message : 'AUM note is invalid.'
  }
  if (!isIdentityKey(record.admin)) return 'Admin identity is missing.'
  if (!isIsoDateTime(record.createdAt)) return 'Created time is missing.'
  return null
}

export function validateIssue(record: IssueRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a registry record.'
  if (record.kind !== 'issue') return 'Not an issue record.'
  if (!isRegisterId(record.registerId)) return 'Register id is missing.'
  if (!isRecordId(record.issueId)) return 'Issue id is missing.'
  if (!isIdentityKey(record.holder)) return 'Holder identity is missing.'
  if (parseUnits(record.units) !== record.units) return 'Units must be a whole number.'
  if (!isIdentityKey(record.admin)) return 'Admin identity is missing.'
  if (!isIsoDateTime(record.issuedAt)) return 'Issued time is missing.'
  return null
}

export function validateTransfer(record: TransferRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a registry record.'
  if (record.kind !== 'transfer') return 'Not a transfer record.'
  if (!isRegisterId(record.registerId)) return 'Register id is missing.'
  if (!isRecordId(record.transferId)) return 'Transfer id is missing.'
  if (!isIdentityKey(record.from) || !isIdentityKey(record.to)) return 'Holder identity is missing.'
  if (sameIdentity(record.from, record.to)) return 'Pick a different holder.'
  if (parseUnits(record.units) !== record.units) return 'Units must be a whole number.'
  if (!Number.isInteger(record.feeSats) || record.feeSats < 1) return 'Transfer fee must be at least 1 sat.'
  if (!Number.isInteger(record.protocolFeeSats) || record.protocolFeeSats < 1) {
    return 'Protocol fee must be at least 1 sat.'
  }
  if (!isIdentityKey(record.actor)) return 'Actor identity is missing.'
  if (!isIsoDateTime(record.transferredAt)) return 'Transfer time is missing.'
  return null
}

function encodeTotal(totalUnits: number | null): string {
  return totalUnits === null ? '' : String(totalUnits)
}

export function encodeRegisterFields(
  record: Omit<RegisterRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: RegisterRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'register', ...record }
  const invalid = validateRegister(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('register'),
    stringToUtf8Bytes(record.registerId),
    stringToUtf8Bytes(record.name.trim()),
    stringToUtf8Bytes(record.unitLabel.trim()),
    stringToUtf8Bytes(encodeTotal(record.totalUnits)),
    stringToUtf8Bytes(record.aumNote.trim()),
    stringToUtf8Bytes(record.admin),
    stringToUtf8Bytes(record.createdAt)
  ]
}

export function encodeIssueFields(
  record: Omit<IssueRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: IssueRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'issue', ...record }
  const invalid = validateIssue(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('issue'),
    stringToUtf8Bytes(record.registerId),
    stringToUtf8Bytes(record.issueId),
    stringToUtf8Bytes(record.holder),
    stringToUtf8Bytes(String(record.units)),
    stringToUtf8Bytes(record.admin),
    stringToUtf8Bytes(record.issuedAt)
  ]
}

export function encodeTransferFields(
  record: Omit<TransferRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: TransferRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'transfer', ...record }
  const invalid = validateTransfer(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('transfer'),
    stringToUtf8Bytes(record.registerId),
    stringToUtf8Bytes(record.transferId),
    stringToUtf8Bytes(record.from),
    stringToUtf8Bytes(record.to),
    stringToUtf8Bytes(String(record.units)),
    stringToUtf8Bytes(String(record.feeSats)),
    stringToUtf8Bytes(String(record.protocolFeeSats)),
    stringToUtf8Bytes(record.actor),
    stringToUtf8Bytes(record.transferredAt)
  ]
}

function registerFromParts(parts: Omit<RegisterRecord, 'magic' | 'version' | 'kind'>): RegisterRecord | null {
  const record: RegisterRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'register', ...parts }
  return validateRegister(record) ? null : record
}

function issueFromParts(parts: Omit<IssueRecord, 'magic' | 'version' | 'kind'>): IssueRecord | null {
  const record: IssueRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'issue', ...parts }
  return validateIssue(record) ? null : record
}

function transferFromParts(parts: Omit<TransferRecord, 'magic' | 'version' | 'kind'>): TransferRecord | null {
  const record: TransferRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'transfer', ...parts }
  return validateTransfer(record) ? null : record
}

function parseOptionalTotal(raw: string): number | null | undefined {
  if (!raw.trim()) return null
  const parsed = Number(raw)
  if (!Number.isInteger(parsed)) return undefined
  return parsed
}

export function parseRegistryFields(fields: Array<number[] | Uint8Array>): RegistryPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION) return null
  if (kind === 'register') {
    if (rest.length < 9) return null
    const totalUnits = parseOptionalTotal(rest[5])
    if (totalUnits === undefined) return null
    return registerFromParts({
      registerId: rest[2],
      name: rest[3],
      unitLabel: rest[4],
      totalUnits,
      aumNote: rest[6],
      admin: rest[7],
      createdAt: rest[8]
    })
  }
  if (kind === 'issue') {
    if (rest.length < 8) return null
    const units = Number(rest[5])
    if (!Number.isInteger(units)) return null
    return issueFromParts({
      registerId: rest[2],
      issueId: rest[3],
      holder: rest[4],
      units,
      admin: rest[6],
      issuedAt: rest[7]
    })
  }
  if (kind === 'transfer') {
    if (rest.length < 11) return null
    const units = Number(rest[6])
    const feeSats = Number(rest[7])
    const protocolFeeSats = Number(rest[8])
    if (!Number.isInteger(units) || !Number.isInteger(feeSats) || !Number.isInteger(protocolFeeSats)) {
      return null
    }
    return transferFromParts({
      registerId: rest[2],
      transferId: rest[3],
      from: rest[4],
      to: rest[5],
      units,
      feeSats,
      protocolFeeSats,
      actor: rest[9],
      transferredAt: rest[10]
    })
  }
  return null
}

export function latestRegister(rows: RegisterRecord[]): RegisterRecord | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

export function foldRegister(
  register: Pick<RegisterRecord, 'totalUnits'>,
  issues: IssueRecord[],
  transfers: TransferRecord[]
): FoldResult {
  const events: Array<{ at: string, order: number, kind: 'issue', issue: IssueRecord } | { at: string, order: number, kind: 'transfer', transfer: TransferRecord }> = [
    ...issues.map((issue, order) => ({ at: issue.issuedAt, order, kind: 'issue' as const, issue })),
    ...transfers.map((transfer, order) => ({ at: transfer.transferredAt, order, kind: 'transfer' as const, transfer }))
  ]
  events.sort((left, right) => {
    const time = left.at.localeCompare(right.at)
    if (time !== 0) return time
    if (left.kind !== right.kind) return left.kind === 'issue' ? -1 : 1
    return left.order - right.order
  })

  const balances = new Map<string, number>()
  let issuedUnits = 0
  let acceptedTransfers = 0
  let skippedIssues = 0
  let skippedTransfers = 0

  const keyFor = (holder: string): string => holder.trim().toLowerCase()

  for (const event of events) {
    if (event.kind === 'issue') {
      const nextIssued = issuedUnits + event.issue.units
      if (register.totalUnits !== null && nextIssued > register.totalUnits) {
        skippedIssues += 1
        continue
      }
      const key = keyFor(event.issue.holder)
      balances.set(key, (balances.get(key) ?? 0) + event.issue.units)
      issuedUnits = nextIssued
      continue
    }
    const fromKey = keyFor(event.transfer.from)
    const toKey = keyFor(event.transfer.to)
    const available = balances.get(fromKey) ?? 0
    if (fromKey === toKey || available < event.transfer.units) {
      skippedTransfers += 1
      continue
    }
    balances.set(fromKey, available - event.transfer.units)
    balances.set(toKey, (balances.get(toKey) ?? 0) + event.transfer.units)
    acceptedTransfers += 1
  }

  const displayHolder = (key: string): string => {
    for (const issue of issues) {
      if (keyFor(issue.holder) === key) return issue.holder
    }
    for (const transfer of transfers) {
      if (keyFor(transfer.to) === key) return transfer.to
      if (keyFor(transfer.from) === key) return transfer.from
    }
    return key
  }

  const holdings = [...balances.entries()]
    .filter(([, units]) => units > 0)
    .map(([holder, units]) => ({ holder: displayHolder(holder), units }))
    .sort((left, right) => right.units - left.units || left.holder.localeCompare(right.holder))

  return { holdings, issuedUnits, acceptedTransfers, skippedIssues, skippedTransfers }
}

export function buildReading(
  register: RegisterRecord,
  fold: FoldResult,
  exportedAt: string
): RegisterReading {
  return {
    kind: 'register-reading',
    name: register.name,
    unitLabel: register.unitLabel,
    registerId: register.registerId,
    totalUnits: register.totalUnits,
    aumNote: register.aumNote,
    admin: register.admin,
    issuedUnits: fold.issuedUnits,
    transferCount: fold.acceptedTransfers,
    holdings: fold.holdings,
    exportedAt
  }
}

export function readingSlug(name: string): string {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return slug || 'register'
}
