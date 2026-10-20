/**
 * Mandate Desk protocol (PushDrop fields).
 *
 * An org hires an outside manager without handing over its keys. Funded sats
 * sit in an output locked to the owner's BRC-42 signing key and OP_CHECKSIG
 * (counterparty `anyone`, key id `mandate-lock`). Anyone can recompute that
 * key from the owner identity. Only the owner wallet can spend it, and a
 * recall spends that output. That is the only rule the v0 script enforces.
 *
 * The whitelist, the per-period cap, the performance fee, and the notice
 * period are computed and recorded. A reader can check them. The locking
 * script does not. A recorded send does not spend the lock. OP_PUSH_TX
 * enforcement of destinations, caps, and the fee output is v1.
 *
 * The mandate id is sha256(ownerKey || nonce): the lowercase owner key
 * immediately followed by the lowercase nonce. Every record is signed with
 * BRC-100 createSignature, counterparty `anyone`, so a reader derives the
 * same child and verifies. Owner records are the open, fund, gain, recall,
 * and change. The manager signs a send. A public send counts only when that
 * signature verifies and the recorded rules allow it.
 *
 * The performance fee is floor(periodGain × feeBps / 10000), in the 5–10%
 * band. v0 records the number. It does not pay it out.
 *
 * Not Treasury (a 2-of-3 board vault). Not Spend Policy (a spender following
 * a payee list). Not Credit (a draw against an invoice).
 */

import { BigNumber, ECDSA, Hash, PrivateKey, PublicKey, Signature } from '@bsv/sdk'
import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'mandate']
/** BRC-42 key id. createSignature counterparty is `anyone`, so readers can derive the signing key. */
export const SIGNING_KEY_ID = 'mandate'
/** BRC-42 key id for the owner-lock output. Same counterparty, different child. */
export const LOCK_KEY_ID = 'mandate-lock'
export const SIGNING_COUNTERPARTY = 'anyone' as const
/** BIP-113: a lockTime at or above this is a unix timestamp, not a block height. */
export const UNIX_LOCKTIME_MIN = 500_000_000
export const BASKET = 'mandate'
export const MAGIC = 'mandate'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'mandate'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'

export const NAME_MAX = 80
export const MAX_WHITELIST = 12
export const MIN_SATS = 1
export const MAX_SATS = 9_000_000_000_000
export const MIN_PERIOD_DAYS = 1
export const MAX_PERIOD_DAYS = 366
export const MIN_NOTICE_DAYS = 1
export const MAX_NOTICE_DAYS = 365
/** 5%. Morpho curator performance fees commonly sit in this band. */
export const MIN_FEE_BPS = 500
/** 10%. */
export const MAX_FEE_BPS = 1_000
export const DEFAULT_FEE_BPS = 800
export const DEFAULT_CAP_SATS = 100_000
export const DEFAULT_PERIOD_DAYS = 30
export const DEFAULT_NOTICE_DAYS = 14
export const DEFAULT_FUND_SATS = 1_000_000
export const DEFAULT_GAIN_SATS = 50_000
export const RECORD_SATS = 1
/** Owner signature check. v0 does not use this opcode to inspect outputs. */
export const OP_CHECKSIG = 0xac

export const OPENED_NOTE = 'Mandate opened. The owner lock is the owner signing key and OP_CHECKSIG.'
export const FUNDED_NOTE = 'Fund recorded. Those sats go under the owner lock when you record.'
export const GAIN_NOTE = 'Fee accrued by formula. Recorded, not paid out.'
export const SENT_NOTE = 'Send recorded. The script did not check the destination or the cap, and this send does not spend the lock.'
export const RECALLED_NOTE = 'Recall spends the owner lock and pulls those sats back.'
export const CHANGE_WAITING = 'Change recorded. It applies after the notice period. The current rules stay until then.'
export const NOT_WHITELISTED = 'That destination is not on the whitelist.'
export const OVER_CAP = 'That send is over the remaining cap for this period.'
export const OVER_BALANCE = 'That send is over the recorded balance.'
export const NOTHING_TO_RECALL = 'There is nothing recorded to pull back.'

export const KINDS = ['open', 'fund', 'gain', 'send', 'recall', 'change'] as const
export type MandateKind = (typeof KINDS)[number]

export const CHANGE_FIELDS = ['cap', 'fee', 'manager', 'whitelist', 'notice'] as const
export type ChangeField = (typeof CHANGE_FIELDS)[number]

export interface OpenRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'open'
  mandateId: string
  orgName: string
  managerKey: string
  whitelist: string[]
  periodCapSats: number
  periodDays: number
  feeBps: number
  noticeDays: number
  ownerKey: string
  /** 32 hex chars. The id is sha256(ownerKey || nonce). */
  nonce: string
  openedAt: string
  /** Owner signing key and OP_CHECKSIG. The only v0 script rule. */
  lockHex: string
  /** DER hex. Empty until Record. */
  ownerSig: string
  /** Block or broadcast time of the tx that published this record. Not signed. */
  txTime?: string
}

export interface FundRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'fund'
  mandateId: string
  amountSats: number
  fundedAt: string
  ownerSig: string
  /** Block or broadcast time of the tx that published this record. Not signed. */
  txTime?: string
}

export interface GainRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'gain'
  mandateId: string
  gainSats: number
  markedAt: string
  ownerSig: string
  /** Block or broadcast time of the tx that published this record. Not signed. */
  txTime?: string
}

export interface SendRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'send'
  mandateId: string
  destinationKey: string
  amountSats: number
  sentAt: string
  /** DER hex of the manager signature. Empty until the manager records. */
  managerSig: string
  /** Block or broadcast time of the tx that published this record. Not signed. */
  txTime?: string
}

export interface RecallRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'recall'
  mandateId: string
  amountSats: number
  recalledAt: string
  ownerSig: string
  /** Block or broadcast time of the tx that published this record. Not signed. */
  txTime?: string
}

export interface ChangeRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'change'
  mandateId: string
  field: ChangeField
  nextValue: string
  /** Notice length in force when the owner signed. */
  noticeDays: number
  proposedAt: string
  effectiveAt: string
  ownerSig: string
  /** Block or broadcast time of the tx that published this record. Not signed. */
  txTime?: string
}

export type MandatePayload = OpenRecord | FundRecord | GainRecord | SendRecord | RecallRecord | ChangeRecord

export interface DeskState {
  mandate: OpenRecord | null
  funds: FundRecord[]
  gains: GainRecord[]
  sends: SendRecord[]
  recalls: RecallRecord[]
  changes: ChangeRecord[]
  rejection: string | null
  notice: string | null
}

export interface OpenInput {
  orgName: string
  managerKey: string
  whitelist: string[] | string
  periodCapSats: number
  periodDays: number
  feeBps: number
  noticeDays: number
  ownerKey?: string
}

export interface Terms {
  managerKey: string
  whitelist: string[]
  periodCapSats: number
  periodDays: number
  feeBps: number
  noticeDays: number
}

export interface Position {
  terms: Terms
  balanceSats: number
  accruedFeeSats: number
  spentThisPeriod: number
  remainingCapSats: number
}

export interface BookMandate {
  mandateId: string
  mandate: OpenRecord
  funds: FundRecord[]
  gains: GainRecord[]
  sends: SendRecord[]
  recalls: RecallRecord[]
  changes: ChangeRecord[]
}

const MANDATE_ID = /^[0-9a-f]{64}$/
const NONCE = /^[0-9a-f]{32}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const IDENTITY_KEY = /^0[23][0-9a-f]{64}$/i
const SIG_HEX = /^[0-9a-f]*$/i

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isMandateId(value: string): boolean {
  return MANDATE_ID.test(value.trim().toLowerCase())
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  return !Number.isNaN(new Date(trimmed).getTime())
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function addDays(iso: string, days: number): string {
  const ms = Date.parse(iso) + days * 24 * 60 * 60 * 1000
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** SHA-256 hex of the lowercase owner key immediately followed by the lowercase nonce. */
export function mandateIdFor(ownerKey: string, nonce: string): string {
  const key = ownerKey.trim().toLowerCase()
  const idNonce = nonce.trim().toLowerCase()
  if (!isIdentityKey(key) || !NONCE.test(idNonce)) throw new Error('Mandate id is missing.')
  return sha256Hex(`${key}${idNonce}`)
}

export function mandateIdMatches(mandate: Pick<OpenRecord, 'mandateId' | 'ownerKey' | 'nonce'>): boolean {
  try {
    return mandate.mandateId === mandateIdFor(mandate.ownerKey, mandate.nonce)
  } catch {
    return false
  }
}

export function identityFor(label: string): string {
  const digest = sha256Hex(`mandate-desk\n${label.trim().toLowerCase()}`)
  return PrivateKey.fromHex(digest).toPublicKey().toString().toLowerCase()
}

export const SAMPLE_MANAGER = identityFor('outside-manager')
export const SAMPLE_DESTINATION = identityFor('reserve-vendor')
export const SAMPLE_OTHER = identityFor('unlisted-payee')

/** floor(gain × bps / 10000). The manager fee accrues by this formula. */
export function feeSatsOf(gainSats: number, feeBps: number): number {
  if (!Number.isSafeInteger(gainSats) || gainSats < 0) throw new Error('Enter a gain in sats.')
  if (!Number.isSafeInteger(feeBps) || feeBps < 0) throw new Error('Enter a fee in basis points.')
  return Number((BigInt(gainSats) * BigInt(feeBps)) / 10_000n)
}

export function periodIndex(openedAt: string, at: string, periodDays: number): number {
  const elapsed = Date.parse(at) - Date.parse(openedAt)
  if (!Number.isFinite(elapsed) || elapsed < 0) return 0
  const span = periodDays * 24 * 60 * 60 * 1000
  return Math.floor(elapsed / span)
}

export function lockInvoice(): string {
  return `${PROTOCOL_ID[0]}-${PROTOCOL_ID[1]}-${LOCK_KEY_ID}`
}

/**
 * v0 mandate lock: the owner's BRC-42 child (counterparty `anyone`, key id
 * `mandate-lock`) and OP_CHECKSIG. Readers recompute it from the owner
 * identity. Only the owner wallet can sign it, so a recall can spend the
 * output. The script does not read the whitelist, the cap, the fee, or the
 * notice clock. OP_PUSH_TX output enforcement is v1.
 */
export function mandateLock(ownerKey: string): string {
  const key = ownerKey.trim().toLowerCase()
  if (!isIdentityKey(key)) throw new Error('Owner key is missing.')
  let child: PublicKey
  try {
    child = PublicKey.fromString(key).deriveChild(new PrivateKey(1), lockInvoice())
  } catch {
    throw new Error('Owner key is missing.')
  }
  return `21${child.toString().toLowerCase()}ac`
}

/** Unix lockTime for a publish instant, so the tx carries its own clock. */
export function lockTimeFromIso(iso: string): number {
  const seconds = Math.floor(Date.parse(iso) / 1000)
  if (!Number.isSafeInteger(seconds) || seconds < UNIX_LOCKTIME_MIN) throw new Error('Time is missing.')
  return seconds
}

/** ISO time when lockTime is a unix timestamp. Block heights return null. */
export function txTimeFromLockTime(lockTime: number): string | null {
  if (!Number.isInteger(lockTime) || lockTime < UNIX_LOCKTIME_MIN || lockTime > 0xffff_ffff) return null
  return nowIso(new Date(lockTime * 1000))
}

function chainTime(row: { txTime?: string }): string | null {
  const txTime = row.txTime?.trim() ?? ''
  if (!isIsoDateTime(txTime)) return null
  return txTime.replace(/\.\d{3}Z$/, 'Z')
}

export function statedTime(row: MandatePayload): string {
  if (row.kind === 'open') return row.openedAt
  if (row.kind === 'fund') return row.fundedAt
  if (row.kind === 'gain') return row.markedAt
  if (row.kind === 'send') return row.sentAt
  if (row.kind === 'recall') return row.recalledAt
  return row.proposedAt
}

/** Chain clock when the overlay or the tx supplied one. Otherwise the stated time. */
export function occurredAt(row: MandatePayload): string {
  return chainTime(row) ?? statedTime(row)
}

/** A payload must not claim it happened before the tx that published it. */
export function statedBeforeTx(row: MandatePayload): boolean {
  const txTime = chainTime(row)
  if (!txTime) return false
  return statedTime(row) < txTime
}

/**
 * When the change carries a tx time, it cannot take effect before that tx
 * plus the notice the owner signed. A later signed effectiveAt still waits.
 */
export function changeAppliesAt(change: ChangeRecord): string {
  const txTime = chainTime(change)
  if (!txTime) return change.effectiveAt
  const earliest = addDays(txTime, change.noticeDays)
  return change.effectiveAt > earliest ? change.effectiveAt : earliest
}

export function emptyDesk(): DeskState {
  return {
    mandate: null,
    funds: [],
    gains: [],
    sends: [],
    recalls: [],
    changes: [],
    rejection: null,
    notice: null
  }
}

export function keepMagic<T extends { magic: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.magic === MAGIC)
}

function assertName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Name the org.')
  if (trimmed.length > NAME_MAX) throw new Error(`Keep the name to ${NAME_MAX} characters.`)
  return trimmed
}

export function assertKey(value: string, label: string): string {
  const trimmed = value.trim().toLowerCase()
  if (!isIdentityKey(trimmed)) throw new Error(`Enter the ${label} identity key.`)
  return trimmed
}

function assertTime(value: string): string {
  const trimmed = value.trim()
  if (!isIsoDateTime(trimmed)) throw new Error('Time is missing.')
  return trimmed.replace(/\.\d{3}Z$/, 'Z')
}

function assertSats(amount: number, label: string): void {
  if (!Number.isInteger(amount) || amount < MIN_SATS || amount > MAX_SATS) {
    throw new Error(`Enter ${label} in sats.`)
  }
}

export function assertFeeBps(feeBps: number): void {
  if (!Number.isInteger(feeBps) || feeBps < MIN_FEE_BPS || feeBps > MAX_FEE_BPS) {
    throw new Error('Performance fee must be from 5% to 10% (500 to 1,000 basis points).')
  }
}

function assertPeriodDays(periodDays: number): void {
  if (!Number.isInteger(periodDays) || periodDays < MIN_PERIOD_DAYS || periodDays > MAX_PERIOD_DAYS) {
    throw new Error(`Period length is a whole number of days from ${MIN_PERIOD_DAYS} to ${MAX_PERIOD_DAYS}.`)
  }
}

function assertNoticeDays(noticeDays: number): void {
  if (!Number.isInteger(noticeDays) || noticeDays < MIN_NOTICE_DAYS || noticeDays > MAX_NOTICE_DAYS) {
    throw new Error(`Notice period is a whole number of days from ${MIN_NOTICE_DAYS} to ${MAX_NOTICE_DAYS}.`)
  }
}

function assertCap(periodCapSats: number): void {
  if (!Number.isInteger(periodCapSats) || periodCapSats < MIN_SATS || periodCapSats > MAX_SATS) {
    throw new Error('Enter a per-period cap in sats.')
  }
}

export function parseWhitelist(value: string[] | string): string[] {
  const parts = (Array.isArray(value) ? value.join(',') : value)
    .split(/[,\n]/)
    .map((part) => part.trim().toLowerCase())
    .filter((part) => part.length > 0)
  if (parts.length < 1 || parts.length > MAX_WHITELIST) {
    throw new Error(`List 1 to ${MAX_WHITELIST} whitelisted destinations.`)
  }
  const keys = parts.map((part) => assertKey(part, 'destination'))
  if (new Set(keys).size !== keys.length) throw new Error('A destination is listed twice.')
  return keys
}

export function whitelistCsv(keys: string[]): string {
  return keys.join(',')
}

function assertSig(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return SIG_HEX.test(trimmed) && trimmed.length % 2 === 0
}

function termsFrom(mandate: OpenRecord): Terms {
  return {
    managerKey: mandate.managerKey,
    whitelist: [...mandate.whitelist],
    periodCapSats: mandate.periodCapSats,
    periodDays: mandate.periodDays,
    feeBps: mandate.feeBps,
    noticeDays: mandate.noticeDays
  }
}

export function canonicalNext(field: ChangeField, value: string): string | null {
  try {
    if (field === 'cap') {
      const amount = Number(value.trim())
      assertCap(amount)
      return String(amount)
    }
    if (field === 'fee') {
      const feeBps = Number(value.trim())
      assertFeeBps(feeBps)
      return String(feeBps)
    }
    if (field === 'notice') {
      const days = Number(value.trim())
      assertNoticeDays(days)
      return String(days)
    }
    if (field === 'manager') return assertKey(value, 'manager')
    if (field === 'whitelist') return whitelistCsv(parseWhitelist(value))
  } catch {
    return null
  }
  return null
}

function applyChange(terms: Terms, change: ChangeRecord): Terms {
  const next: Terms = { ...terms, whitelist: [...terms.whitelist] }
  if (change.field === 'cap') next.periodCapSats = Number(change.nextValue)
  if (change.field === 'fee') next.feeBps = Number(change.nextValue)
  if (change.field === 'notice') next.noticeDays = Number(change.nextValue)
  if (change.field === 'manager') next.managerKey = change.nextValue
  if (change.field === 'whitelist') next.whitelist = change.nextValue.split(',')
  return next
}

type ReplayEvent =
  | { at: string, rank: number, index: number, kind: 'change', change: ChangeRecord }
  | { at: string, rank: number, index: number, kind: 'fund', fund: FundRecord }
  | { at: string, rank: number, index: number, kind: 'gain', gain: GainRecord }
  | { at: string, rank: number, index: number, kind: 'send', send: SendRecord }
  | { at: string, rank: number, index: number, kind: 'recall', recall: RecallRecord }

export function positionOf(state: DeskState, at = nowIso()): Position | null {
  const mandate = state.mandate
  if (!mandate) return null
  const until = assertTime(at)
  const opened = occurredAt(mandate)
  let terms = termsFrom(mandate)
  let balanceSats = 0
  let accruedFeeSats = 0
  const counted: Array<{ amountSats: number, at: string }> = []
  const events: ReplayEvent[] = []
  state.changes.forEach((change, index) => {
    const applies = changeAppliesAt(change)
    if (applies <= until) events.push({ at: applies, rank: 0, index, kind: 'change', change })
  })
  state.funds.forEach((fund, index) => {
    const when = occurredAt(fund)
    if (when <= until) events.push({ at: when, rank: 1, index, kind: 'fund', fund })
  })
  state.gains.forEach((gain, index) => {
    const when = occurredAt(gain)
    if (when <= until) events.push({ at: when, rank: 2, index, kind: 'gain', gain })
  })
  state.sends.forEach((send, index) => {
    const when = occurredAt(send)
    if (when <= until) events.push({ at: when, rank: 3, index, kind: 'send', send })
  })
  state.recalls.forEach((recall, index) => {
    const when = occurredAt(recall)
    if (when <= until) events.push({ at: when, rank: 4, index, kind: 'recall', recall })
  })
  events.sort((left, right) => (
    left.at < right.at ? -1 : left.at > right.at ? 1 : left.rank - right.rank || left.index - right.index
  ))
  for (const event of events) {
    if (event.kind === 'change') terms = applyChange(terms, event.change)
    else if (event.kind === 'fund') balanceSats += event.fund.amountSats
    else if (event.kind === 'gain') accruedFeeSats += feeSatsOf(event.gain.gainSats, terms.feeBps)
    else if (event.kind === 'send') {
      balanceSats -= event.send.amountSats
      counted.push({ amountSats: event.send.amountSats, at: event.at })
    } else balanceSats -= event.recall.amountSats
  }
  const period = periodIndex(opened, until, mandate.periodDays)
  const spentThisPeriod = counted
    .filter((send) => periodIndex(opened, send.at, mandate.periodDays) === period)
    .reduce((sum, send) => sum + send.amountSats, 0)
  return {
    terms,
    balanceSats,
    accruedFeeSats,
    spentThisPeriod,
    remainingCapSats: Math.max(0, terms.periodCapSats - spentThisPeriod)
  }
}

/** Rewrite stated times to the publish instant so they are not before the tx. */
export function stampForPublish(desk: DeskState, at = nowIso()): DeskState {
  if (!desk.mandate) return desk
  const publishedAt = assertTime(at)
  return {
    ...desk,
    mandate: { ...desk.mandate, openedAt: publishedAt, ownerSig: '' },
    funds: desk.funds.map((row) => ({ ...row, fundedAt: publishedAt, ownerSig: '' })),
    gains: desk.gains.map((row) => ({ ...row, markedAt: publishedAt, ownerSig: '' })),
    sends: desk.sends.map((row) => ({ ...row, sentAt: publishedAt, managerSig: '' })),
    recalls: desk.recalls.map((row) => ({ ...row, recalledAt: publishedAt, ownerSig: '' })),
    changes: desk.changes.map((row) => ({
      ...row,
      proposedAt: publishedAt,
      effectiveAt: addDays(publishedAt, row.noticeDays),
      ownerSig: ''
    }))
  }
}

function requireMandate(state: DeskState): OpenRecord {
  if (!state.mandate) throw new Error('Open a mandate first.')
  return state.mandate
}

function refuse(state: DeskState, rejection: string): DeskState {
  return { ...state, rejection, notice: null }
}

function accept(state: DeskState, patch: Partial<DeskState>, notice: string): DeskState {
  return { ...state, ...patch, rejection: null, notice }
}

export function openMandate(input: OpenInput, now = nowIso(), nonce = newNonce()): DeskState {
  const orgName = assertName(input.orgName)
  const managerKey = assertKey(input.managerKey, 'manager')
  const whitelist = parseWhitelist(input.whitelist)
  assertCap(input.periodCapSats)
  assertPeriodDays(input.periodDays)
  assertFeeBps(input.feeBps)
  assertNoticeDays(input.noticeDays)
  const ownerKey = input.ownerKey ? assertKey(input.ownerKey, 'owner') : identityFor(orgName)
  if (ownerKey === managerKey) throw new Error('The manager is an outside key. It is not the owner key.')
  const idNonce = nonce.trim().toLowerCase()
  if (!NONCE.test(idNonce)) throw new Error('Nonce is missing.')
  const openedAt = assertTime(now)
  const mandateId = mandateIdFor(ownerKey, idNonce)
  const mandate: OpenRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'open',
    mandateId,
    orgName,
    managerKey,
    whitelist,
    periodCapSats: input.periodCapSats,
    periodDays: input.periodDays,
    feeBps: input.feeBps,
    noticeDays: input.noticeDays,
    ownerKey,
    nonce: idNonce,
    openedAt,
    lockHex: mandateLock(ownerKey),
    ownerSig: ''
  }
  const invalid = validateOpen(mandate)
  if (invalid) throw new Error(invalid)
  return { ...emptyDesk(), mandate, notice: OPENED_NOTE }
}

export function fundMandate(state: DeskState, amountSats: number, now = nowIso()): DeskState {
  const mandate = requireMandate(state)
  assertSats(amountSats, 'a fund amount')
  const fund: FundRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'fund',
    mandateId: mandate.mandateId,
    amountSats,
    fundedAt: assertTime(now),
    ownerSig: ''
  }
  return accept(state, { funds: [...state.funds, fund] }, FUNDED_NOTE)
}

export function markGain(state: DeskState, gainSats: number, now = nowIso()): DeskState {
  const mandate = requireMandate(state)
  if (!Number.isInteger(gainSats) || gainSats < 0 || gainSats > MAX_SATS) throw new Error('Enter a gain in sats.')
  const markedAt = assertTime(now)
  const gain: GainRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'gain',
    mandateId: mandate.mandateId,
    gainSats,
    markedAt,
    ownerSig: ''
  }
  const next = accept(state, { gains: [...state.gains, gain] }, GAIN_NOTE)
  const accrued = feeSatsOf(gainSats, positionOf(next, markedAt)?.terms.feeBps ?? mandate.feeBps)
  return { ...next, notice: `Fee accrues ${accrued.toLocaleString('en-US')} sats. Recorded, not paid out.` }
}

export function sendMandate(state: DeskState, destination: string, amountSats: number, now = nowIso()): DeskState {
  const mandate = requireMandate(state)
  const destinationKey = assertKey(destination, 'destination')
  assertSats(amountSats, 'a send amount')
  const sentAt = assertTime(now)
  const position = positionOf(state, sentAt)
  if (!position) throw new Error('Open a mandate first.')
  if (!position.terms.whitelist.includes(destinationKey)) return refuse(state, NOT_WHITELISTED)
  if (amountSats > position.balanceSats) return refuse(state, OVER_BALANCE)
  if (amountSats > position.remainingCapSats) return refuse(state, OVER_CAP)
  const send: SendRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'send',
    mandateId: mandate.mandateId,
    destinationKey,
    amountSats,
    sentAt,
    managerSig: ''
  }
  return accept(state, { sends: [...state.sends, send] }, SENT_NOTE)
}

export function recallMandate(state: DeskState, now = nowIso()): DeskState {
  const mandate = requireMandate(state)
  const recalledAt = assertTime(now)
  const position = positionOf(state, recalledAt)
  if (!position || position.balanceSats < 1) return refuse(state, NOTHING_TO_RECALL)
  const recall: RecallRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'recall',
    mandateId: mandate.mandateId,
    amountSats: position.balanceSats,
    recalledAt,
    ownerSig: ''
  }
  return accept(state, { recalls: [...state.recalls, recall] }, RECALLED_NOTE)
}

export function proposeChange(state: DeskState, field: string, nextValue: string, now = nowIso()): DeskState {
  const mandate = requireMandate(state)
  if (!CHANGE_FIELDS.includes(field as ChangeField)) throw new Error('Choose which rule to change.')
  const changeField = field as ChangeField
  const canonical = canonicalNext(changeField, nextValue)
  if (!canonical) throw new Error('That new rule is not valid.')
  const proposedAt = assertTime(now)
  const position = positionOf(state, proposedAt)
  if (!position) throw new Error('Open a mandate first.')
  if (changeField === 'manager' && canonical === mandate.ownerKey) {
    throw new Error('The manager is an outside key. It is not the owner key.')
  }
  const current = currentValue(position.terms, changeField)
  if (canonical === current) throw new Error('That is already the rule.')
  const noticeDays = position.terms.noticeDays
  const change: ChangeRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'change',
    mandateId: mandate.mandateId,
    field: changeField,
    nextValue: canonical,
    noticeDays,
    proposedAt,
    effectiveAt: addDays(proposedAt, noticeDays),
    ownerSig: ''
  }
  return accept(state, { changes: [...state.changes, change] }, CHANGE_WAITING)
}

function currentValue(terms: Terms, field: ChangeField): string {
  if (field === 'cap') return String(terms.periodCapSats)
  if (field === 'fee') return String(terms.feeBps)
  if (field === 'notice') return String(terms.noticeDays)
  if (field === 'manager') return terms.managerKey
  return whitelistCsv(terms.whitelist)
}

export function pendingChanges(state: DeskState, at = nowIso()): ChangeRecord[] {
  const until = isIsoDateTime(at) ? at : nowIso()
  return state.changes.filter((change) => change.effectiveAt > until)
}

export function validateOpen(mandate: OpenRecord): string | null {
  if (mandate.magic !== MAGIC || mandate.kind !== 'open') return 'Not a mandate.'
  if (!isMandateId(mandate.mandateId)) return 'Mandate id is missing.'
  if (!mandate.orgName.trim() || mandate.orgName.length > NAME_MAX) return 'Org name is missing.'
  if (!isIdentityKey(mandate.managerKey) || !isIdentityKey(mandate.ownerKey)) return 'Keys are missing.'
  if (mandate.managerKey === mandate.ownerKey) return 'The manager is an outside key. It is not the owner key.'
  if (!mandateIdMatches(mandate)) return 'Mandate id does not match the owner key.'
  if (mandate.whitelist.length < 1 || mandate.whitelist.length > MAX_WHITELIST) return 'Whitelist is missing.'
  if (mandate.whitelist.some((key) => !isIdentityKey(key))) return 'Whitelist is missing.'
  if (new Set(mandate.whitelist).size !== mandate.whitelist.length) return 'A destination is listed twice.'
  try {
    assertCap(mandate.periodCapSats)
    assertPeriodDays(mandate.periodDays)
    assertFeeBps(mandate.feeBps)
    assertNoticeDays(mandate.noticeDays)
  } catch (error) {
    return error instanceof Error ? error.message : 'Mandate terms are invalid.'
  }
  if (!NONCE.test(mandate.nonce)) return 'Nonce is missing.'
  if (!isIsoDateTime(mandate.openedAt)) return 'Opened time is missing.'
  if (mandate.lockHex !== mandateLock(mandate.ownerKey)) return 'Owner lock does not match the owner key.'
  if (!assertSig(mandate.ownerSig)) return 'Owner signature is invalid.'
  return null
}

export function validateFund(fund: FundRecord): string | null {
  if (fund.magic !== MAGIC || fund.kind !== 'fund') return 'Not a fund.'
  if (!isMandateId(fund.mandateId)) return 'Mandate id is missing.'
  if (!Number.isInteger(fund.amountSats) || fund.amountSats < MIN_SATS || fund.amountSats > MAX_SATS) return 'Fund amount is missing.'
  if (!isIsoDateTime(fund.fundedAt)) return 'Funded time is missing.'
  if (!assertSig(fund.ownerSig)) return 'Owner signature is invalid.'
  return null
}

export function validateGain(gain: GainRecord): string | null {
  if (gain.magic !== MAGIC || gain.kind !== 'gain') return 'Not a gain.'
  if (!isMandateId(gain.mandateId)) return 'Mandate id is missing.'
  if (!Number.isInteger(gain.gainSats) || gain.gainSats < 0 || gain.gainSats > MAX_SATS) return 'Gain is missing.'
  if (!isIsoDateTime(gain.markedAt)) return 'Marked time is missing.'
  if (!assertSig(gain.ownerSig)) return 'Owner signature is invalid.'
  return null
}

export function validateSend(send: SendRecord): string | null {
  if (send.magic !== MAGIC || send.kind !== 'send') return 'Not a send.'
  if (!isMandateId(send.mandateId)) return 'Mandate id is missing.'
  if (!isIdentityKey(send.destinationKey)) return 'Destination is missing.'
  if (!Number.isInteger(send.amountSats) || send.amountSats < MIN_SATS || send.amountSats > MAX_SATS) return 'Send amount is missing.'
  if (!isIsoDateTime(send.sentAt)) return 'Sent time is missing.'
  if (!assertSig(send.managerSig)) return 'Manager signature is invalid.'
  return null
}

export function validateRecall(recall: RecallRecord): string | null {
  if (recall.magic !== MAGIC || recall.kind !== 'recall') return 'Not a recall.'
  if (!isMandateId(recall.mandateId)) return 'Mandate id is missing.'
  if (!Number.isInteger(recall.amountSats) || recall.amountSats < MIN_SATS) return 'Recall amount is missing.'
  if (!isIsoDateTime(recall.recalledAt)) return 'Recalled time is missing.'
  if (!assertSig(recall.ownerSig)) return 'Owner signature is invalid.'
  return null
}

export function validateChange(change: ChangeRecord): string | null {
  if (change.magic !== MAGIC || change.kind !== 'change') return 'Not a change.'
  if (!isMandateId(change.mandateId)) return 'Mandate id is missing.'
  if (!CHANGE_FIELDS.includes(change.field)) return 'Change field is missing.'
  if (canonicalNext(change.field, change.nextValue) !== change.nextValue) return 'New rule is invalid.'
  try {
    assertNoticeDays(change.noticeDays)
  } catch (error) {
    return error instanceof Error ? error.message : 'Notice is invalid.'
  }
  if (!isIsoDateTime(change.proposedAt) || !isIsoDateTime(change.effectiveAt)) return 'Change time is missing.'
  if (change.effectiveAt !== addDays(change.proposedAt, change.noticeDays)) return 'Notice period does not match.'
  if (!assertSig(change.ownerSig)) return 'Owner signature is invalid.'
  return null
}

function encodeHead(kind: MandateKind, mandateId: string): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(kind),
    stringToUtf8Bytes(mandateId)
  ]
}

export function encodeOpenFields(mandate: OpenRecord): number[][] {
  const invalid = validateOpen(mandate)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('open', mandate.mandateId),
    stringToUtf8Bytes(mandate.orgName),
    stringToUtf8Bytes(mandate.managerKey),
    stringToUtf8Bytes(whitelistCsv(mandate.whitelist)),
    stringToUtf8Bytes(String(mandate.periodCapSats)),
    stringToUtf8Bytes(String(mandate.periodDays)),
    stringToUtf8Bytes(String(mandate.feeBps)),
    stringToUtf8Bytes(String(mandate.noticeDays)),
    stringToUtf8Bytes(mandate.ownerKey),
    stringToUtf8Bytes(mandate.nonce),
    stringToUtf8Bytes(mandate.openedAt),
    stringToUtf8Bytes(mandate.lockHex),
    stringToUtf8Bytes(mandate.ownerSig)
  ]
}

export function encodeFundFields(fund: FundRecord): number[][] {
  const invalid = validateFund(fund)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('fund', fund.mandateId),
    stringToUtf8Bytes(String(fund.amountSats)),
    stringToUtf8Bytes(fund.fundedAt),
    stringToUtf8Bytes(fund.ownerSig)
  ]
}

export function encodeGainFields(gain: GainRecord): number[][] {
  const invalid = validateGain(gain)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('gain', gain.mandateId),
    stringToUtf8Bytes(String(gain.gainSats)),
    stringToUtf8Bytes(gain.markedAt),
    stringToUtf8Bytes(gain.ownerSig)
  ]
}

export function encodeSendFields(send: SendRecord): number[][] {
  const invalid = validateSend(send)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('send', send.mandateId),
    stringToUtf8Bytes(send.destinationKey),
    stringToUtf8Bytes(String(send.amountSats)),
    stringToUtf8Bytes(send.sentAt),
    stringToUtf8Bytes(send.managerSig)
  ]
}

export function encodeRecallFields(recall: RecallRecord): number[][] {
  const invalid = validateRecall(recall)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('recall', recall.mandateId),
    stringToUtf8Bytes(String(recall.amountSats)),
    stringToUtf8Bytes(recall.recalledAt),
    stringToUtf8Bytes(recall.ownerSig)
  ]
}

export function encodeChangeFields(change: ChangeRecord): number[][] {
  const invalid = validateChange(change)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('change', change.mandateId),
    stringToUtf8Bytes(change.field),
    stringToUtf8Bytes(change.nextValue),
    stringToUtf8Bytes(String(change.noticeDays)),
    stringToUtf8Bytes(change.proposedAt),
    stringToUtf8Bytes(change.effectiveAt),
    stringToUtf8Bytes(change.ownerSig)
  ]
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

function whole(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseMandateFields(fields: Array<number[] | Uint8Array>): MandatePayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3 || rest[0] !== SCHEMA_VERSION) return null
  const kind = rest[1]
  const mandateId = rest[2]
  if (kind === 'open') {
    if (rest.length < 15) return null
    const periodCapSats = whole(rest[6])
    const periodDays = whole(rest[7])
    const feeBps = whole(rest[8])
    const noticeDays = whole(rest[9])
    if (periodCapSats == null || periodDays == null || feeBps == null || noticeDays == null) return null
    let whitelist: string[]
    try {
      whitelist = parseWhitelist(rest[5])
    } catch {
      return null
    }
    const mandate: OpenRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'open',
      mandateId,
      orgName: rest[3],
      managerKey: rest[4],
      whitelist,
      periodCapSats,
      periodDays,
      feeBps,
      noticeDays,
      ownerKey: rest[10],
      nonce: rest[11],
      openedAt: rest[12],
      lockHex: rest[13],
      ownerSig: rest[14]
    }
    return validateOpen(mandate) ? null : mandate
  }
  if (kind === 'fund') {
    if (rest.length < 6) return null
    const amountSats = whole(rest[3])
    if (amountSats == null) return null
    const fund: FundRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'fund',
      mandateId,
      amountSats,
      fundedAt: rest[4],
      ownerSig: rest[5]
    }
    return validateFund(fund) ? null : fund
  }
  if (kind === 'gain') {
    if (rest.length < 6) return null
    const gainSats = whole(rest[3])
    if (gainSats == null) return null
    const gain: GainRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'gain',
      mandateId,
      gainSats,
      markedAt: rest[4],
      ownerSig: rest[5]
    }
    return validateGain(gain) ? null : gain
  }
  if (kind === 'send') {
    if (rest.length < 7) return null
    const amountSats = whole(rest[4])
    if (amountSats == null) return null
    const send: SendRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'send',
      mandateId,
      destinationKey: rest[3],
      amountSats,
      sentAt: rest[5],
      managerSig: rest[6]
    }
    return validateSend(send) ? null : send
  }
  if (kind === 'recall') {
    if (rest.length < 6) return null
    const amountSats = whole(rest[3])
    if (amountSats == null) return null
    const recall: RecallRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'recall',
      mandateId,
      amountSats,
      recalledAt: rest[4],
      ownerSig: rest[5]
    }
    return validateRecall(recall) ? null : recall
  }
  if (kind === 'change') {
    if (rest.length < 9) return null
    const noticeDays = whole(rest[5])
    if (noticeDays == null) return null
    const change: ChangeRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'change',
      mandateId,
      field: rest[3] as ChangeField,
      nextValue: rest[4],
      noticeDays,
      proposedAt: rest[6],
      effectiveAt: rest[7],
      ownerSig: rest[8]
    }
    return validateChange(change) ? null : change
  }
  return null
}

export function openMessage(mandate: OpenRecord): number[] {
  return stringToUtf8Bytes([
    'mandate',
    'open',
    mandate.mandateId,
    mandate.orgName,
    mandate.managerKey,
    whitelistCsv(mandate.whitelist),
    String(mandate.periodCapSats),
    String(mandate.periodDays),
    String(mandate.feeBps),
    String(mandate.noticeDays),
    mandate.ownerKey,
    mandate.nonce,
    mandate.openedAt,
    mandate.lockHex
  ].join('\n'))
}

export function fundMessage(fund: FundRecord): number[] {
  return stringToUtf8Bytes(['mandate', 'fund', fund.mandateId, String(fund.amountSats), fund.fundedAt].join('\n'))
}

export function gainMessage(gain: GainRecord): number[] {
  return stringToUtf8Bytes(['mandate', 'gain', gain.mandateId, String(gain.gainSats), gain.markedAt].join('\n'))
}

export function sendMessage(send: SendRecord): number[] {
  return stringToUtf8Bytes([
    'mandate',
    'send',
    send.mandateId,
    send.destinationKey,
    String(send.amountSats),
    send.sentAt
  ].join('\n'))
}

export function recallMessage(recall: RecallRecord): number[] {
  return stringToUtf8Bytes(['mandate', 'recall', recall.mandateId, String(recall.amountSats), recall.recalledAt].join('\n'))
}

export function changeMessage(change: ChangeRecord): number[] {
  return stringToUtf8Bytes([
    'mandate',
    'change',
    change.mandateId,
    change.field,
    change.nextValue,
    String(change.noticeDays),
    change.proposedAt,
    change.effectiveAt
  ].join('\n'))
}

export function signingInvoice(): string {
  return `${PROTOCOL_ID[0]}-${PROTOCOL_ID[1]}-${SIGNING_KEY_ID}`
}

/**
 * Public half of a wallet createSignature with counterparty `anyone`.
 * The reader has the identity key and derives the same child the wallet signed with.
 */
export function derivedSigningKey(identityKey: string): PublicKey | null {
  if (!isIdentityKey(identityKey)) return null
  try {
    return PublicKey.fromString(identityKey.trim()).deriveChild(new PrivateKey(1), signingInvoice())
  } catch {
    return null
  }
}

function hexToBytes(value: string): number[] | null {
  const trimmed = value.trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(trimmed) || trimmed.length < 16 || trimmed.length % 2 !== 0) return null
  const out: number[] = []
  for (let index = 0; index < trimmed.length; index += 2) {
    out.push(Number.parseInt(trimmed.slice(index, index + 2), 16))
  }
  return out
}

export function signatureOk(identityKey: string, message: number[], signatureHex: string): boolean {
  const key = derivedSigningKey(identityKey)
  const der = hexToBytes(signatureHex)
  if (!key || !der) return false
  try {
    const hash = Hash.sha256(message)
    const signature = Signature.fromDER(der)
    return ECDSA.verify(new BigNumber(hash), signature, key)
  } catch {
    return false
  }
}

export interface RecordSigner {
  getPublicKey(args: { identityKey: true }): Promise<{ publicKey: string }>
  createSignature(args: {
    data: number[]
    protocolID: typeof PROTOCOL_ID
    keyID: typeof SIGNING_KEY_ID
    counterparty: typeof SIGNING_COUNTERPARTY
  }): Promise<{ signature: number[] }>
}

async function walletSig(wallet: RecordSigner, message: number[]): Promise<string> {
  const { signature } = await wallet.createSignature({
    data: message,
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: SIGNING_COUNTERPARTY
  })
  return signature.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Point every record at sha256(ownerKey || nonce) and clear signatures. */
export function bindDeskOwner(desk: DeskState, ownerKey: string): DeskState {
  if (!desk.mandate) return desk
  const key = assertKey(ownerKey, 'owner')
  if (key === desk.mandate.managerKey) throw new Error('The owner key and the manager key must be different.')
  const mandateId = mandateIdFor(key, desk.mandate.nonce)
  const retarget = <T extends { mandateId: string }>(row: T): T => ({ ...row, mandateId })
  return {
    ...desk,
    mandate: {
      ...desk.mandate,
      ownerKey: key,
      mandateId,
      lockHex: mandateLock(key),
      ownerSig: ''
    },
    funds: desk.funds.map((row) => ({ ...retarget(row), ownerSig: '' })),
    gains: desk.gains.map((row) => ({ ...retarget(row), ownerSig: '' })),
    sends: desk.sends.map((row) => ({ ...retarget(row), managerSig: '' })),
    recalls: desk.recalls.map((row) => ({ ...retarget(row), ownerSig: '' })),
    changes: desk.changes.map((row) => ({ ...retarget(row), ownerSig: '' }))
  }
}

export async function signOwnerRecords(wallet: RecordSigner, desk: DeskState): Promise<DeskState> {
  if (!desk.mandate) throw new Error('Open a mandate first.')
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  const bound = bindDeskOwner(desk, publicKey)
  if (!bound.mandate) throw new Error('Open a mandate first.')
  const openDraft = { ...bound.mandate, ownerSig: '' }
  const mandate: OpenRecord = { ...openDraft, ownerSig: await walletSig(wallet, openMessage(openDraft)) }
  const funds: FundRecord[] = []
  for (const fund of bound.funds) {
    const next = { ...fund, ownerSig: '' }
    funds.push({ ...next, ownerSig: await walletSig(wallet, fundMessage(next)) })
  }
  const gains: GainRecord[] = []
  for (const gain of bound.gains) {
    const next = { ...gain, ownerSig: '' }
    gains.push({ ...next, ownerSig: await walletSig(wallet, gainMessage(next)) })
  }
  const recalls: RecallRecord[] = []
  for (const recall of bound.recalls) {
    const next = { ...recall, ownerSig: '' }
    recalls.push({ ...next, ownerSig: await walletSig(wallet, recallMessage(next)) })
  }
  const changes: ChangeRecord[] = []
  for (const change of bound.changes) {
    const next = { ...change, ownerSig: '' }
    changes.push({ ...next, ownerSig: await walletSig(wallet, changeMessage(next)) })
  }
  return { ...bound, mandate, funds, gains, recalls, changes }
}

export async function signManagerSends(wallet: RecordSigner, desk: DeskState): Promise<DeskState> {
  if (!desk.mandate) throw new Error('Open a mandate first.')
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  const key = assertKey(publicKey, 'manager')
  const sends: SendRecord[] = []
  for (const send of desk.sends) {
    const manager = positionOf(desk, send.sentAt)?.terms.managerKey
    if (key !== manager) {
      sends.push(send)
      continue
    }
    const next = { ...send, managerSig: '' }
    sends.push({ ...next, managerSig: await walletSig(wallet, sendMessage(next)) })
  }
  return { ...desk, sends }
}

/** Owner wallet signs owner records. The same wallet signs sends only when it is the manager. */
export async function signRecordedDesk(wallet: RecordSigner, desk: DeskState): Promise<DeskState> {
  const owned = await signOwnerRecords(wallet, desk)
  return signManagerSends(wallet, owned)
}

function sendAcceptable(desk: DeskState, send: SendRecord): boolean {
  if (statedBeforeTx(send)) return false
  const position = positionOf(desk, occurredAt(send))
  if (!position) return false
  if (!signatureOk(position.terms.managerKey, sendMessage(send), send.managerSig)) return false
  if (!position.terms.whitelist.includes(send.destinationKey)) return false
  if (send.amountSats > position.balanceSats || send.amountSats > position.remainingCapSats) return false
  return true
}

function changeAcceptable(desk: DeskState, change: ChangeRecord): boolean {
  const mandate = desk.mandate
  if (!mandate) return false
  if (statedBeforeTx(change)) return false
  if (!signatureOk(mandate.ownerKey, changeMessage(change), change.ownerSig)) return false
  const position = positionOf(desk, occurredAt(change))
  if (!position) return false
  if (change.noticeDays !== position.terms.noticeDays) return false
  if (change.effectiveAt !== addDays(change.proposedAt, change.noticeDays)) return false
  const txTime = chainTime(change)
  if (txTime && changeAppliesAt(change) < addDays(txTime, change.noticeDays)) return false
  if (change.field === 'manager' && change.nextValue === mandate.ownerKey) return false
  return true
}

type AcceptedKind = 'change' | 'fund' | 'gain' | 'send' | 'recall'

function acceptanceOrder(records: MandatePayload[]): MandatePayload[] {
  const rank: Record<AcceptedKind, number> = { change: 0, fund: 1, gain: 2, send: 3, recall: 4 }
  const atOf = (row: MandatePayload): string => occurredAt(row)
  return [...records].sort((left, right) => {
    const leftAt = atOf(left)
    const rightAt = atOf(right)
    if (leftAt !== rightAt) return leftAt < rightAt ? -1 : 1
    const leftRank = left.kind === 'open' ? -1 : rank[left.kind]
    const rightRank = right.kind === 'open' ? -1 : rank[right.kind]
    return leftRank - rightRank
  })
}

/**
 * Public book. Drops a mandate whose id is not sha256(ownerKey || nonce),
 * drops a record the owner or manager did not sign, and drops a send the
 * recorded whitelist or cap would refuse. Empty signatures do not count.
 */
export function deskFromRecords(records: MandatePayload[], mandateId?: string): DeskState | null {
  const rows = keepMagic(records)
  const opens = rows.filter((row): row is OpenRecord => row.kind === 'open').filter((mandate) => {
    if (mandateId && mandate.mandateId !== mandateId.toLowerCase()) return false
    if (statedBeforeTx(mandate)) return false
    if (!mandateIdMatches(mandate)) return false
    return signatureOk(mandate.ownerKey, openMessage(mandate), mandate.ownerSig)
  }).sort((left, right) => (occurredAt(left) < occurredAt(right) ? -1 : occurredAt(left) > occurredAt(right) ? 1 : 0))
  const mandate = opens[0]
  if (!mandate) return null
  let desk: DeskState = { ...emptyDesk(), mandate }
  for (const row of acceptanceOrder(rows.filter((item) => item.kind !== 'open' && item.mandateId === mandate.mandateId))) {
    if (row.kind === 'fund' && signatureOk(mandate.ownerKey, fundMessage(row), row.ownerSig)) {
      desk = { ...desk, funds: [...desk.funds, row] }
    } else if (row.kind === 'gain' && signatureOk(mandate.ownerKey, gainMessage(row), row.ownerSig)) {
      desk = { ...desk, gains: [...desk.gains, row] }
    } else if (row.kind === 'change' && changeAcceptable(desk, row)) {
      desk = { ...desk, changes: [...desk.changes, row] }
    } else if (row.kind === 'send' && sendAcceptable(desk, row)) {
      desk = { ...desk, sends: [...desk.sends, row] }
    } else if (row.kind === 'recall' && !statedBeforeTx(row)) {
      const position = positionOf(desk, occurredAt(row))
      if (position && row.amountSats === position.balanceSats && signatureOk(mandate.ownerKey, recallMessage(row), row.ownerSig)) {
        desk = { ...desk, recalls: [...desk.recalls, row] }
      }
    }
  }
  return desk
}

export function bookFromRecords(records: MandatePayload[]): BookMandate[] {
  const ids = new Set<string>()
  for (const row of keepMagic(records)) {
    if (row.kind === 'open' && mandateIdMatches(row)) ids.add(row.mandateId)
  }
  const books: BookMandate[] = []
  for (const id of ids) {
    const desk = deskFromRecords(records, id)
    if (!desk?.mandate) continue
    books.push({
      mandateId: id,
      mandate: desk.mandate,
      funds: desk.funds,
      gains: desk.gains,
      sends: desk.sends,
      recalls: desk.recalls,
      changes: desk.changes
    })
  }
  return books.sort((left, right) => (left.mandate.openedAt < right.mandate.openedAt ? 1 : -1))
}
