/**
 * Round Desk protocol (PushDrop fields).
 *
 * A business, co-op, or startup opens a raise. Backers disclose only the
 * certificate fields that raise asked for (BRC-52/53 selective disclosure,
 * recorded here, not checked inside the locking script). Each commitment
 * is an escrow output locked to `escrow-<roundId>`, counterparty `anyone`,
 * so any reader re-derives the key from the issuer identity. Only the
 * issuer wallet can spend it.
 *
 * The round id is sha256(issuerKey || nonce). A commit id is
 * sha256(backerKey || nonce). Readers recompute both and drop mismatches.
 * Every record is signed with BRC-100 createSignature, key id `round`,
 * counterparty `anyone`, so a reader derives the same child and verifies.
 *
 * Script-enforced: the escrow lock, and nothing else. Record funds that
 * lock with createAction at the commitment amount. No other script holds
 * the raise.
 * Computed and recorded: eligibility, the minimum, the maximum, the
 * deadline, a fixed price or a clearing price, the refund, the
 * allocation, and the Registry Desk handoff. OP_PUSH_TX enforcement of
 * those outputs is v1. v0 does not run a secondary market.
 *
 * A time written into a record does not order commits or decide the
 * deadline. On the public book the transaction does: overlay admission
 * time when the lookup has it, otherwise nLockTime only as a not-before.
 * A lock time at or after the deadline proves the tx was late. A lock
 * time before the deadline does not prove it was early. A commit stated
 * before the deadline does not count when its own tx is after.
 *
 * Not a token listing. Not Keepsake (a numbered edition). Not Bounty
 * (a severity pool). Not Registry itself — close hands holdings to it.
 */

import { BigNumber, ECDSA, Hash, KeyDeriver, PrivateKey, PublicKey, Signature } from '@bsv/sdk'
import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'round']
/** BRC-42 key id. createSignature counterparty is `anyone`, so readers can derive the signing key. */
export const SIGNING_KEY_ID = 'round'
export const SIGNING_COUNTERPARTY = 'anyone' as const
export const BASKET = 'round'
export const MAGIC = 'round'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'round'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const REGISTRY_MAGIC = 'registry'

export const NAME_MAX = 80
export const UNIT_LABEL_MAX = 24
export const FIELD_VALUE_MAX = 80
export const CERT_TEXT_MAX = 64
export const MIN_SATS = 1
export const MAX_SATS = 9_000_000_000_000
export const DEFAULT_PRICE_SATS = 1_000
export const DEFAULT_MIN_SATS = 3_000
export const DEFAULT_MAX_SATS = 10_000
export const RECORD_SATS = 1

/**
 * v1 will use OP_PUSH_TX so the locking script can require the refund
 * and the allocation outputs. v0 does not. The script only locks escrow.
 */
export const OP_PUSH_TX = 'OP_PUSH_TX'
export const SCRIPT_ENFORCES_ALLOCATION = false
export const V1_NOTE =
  'OP_PUSH_TX enforcement of the minimum, the maximum, the deadline, and the refund outputs is v1 work.'

export const PRICING = ['fixed', 'clearing'] as const
export type Pricing = (typeof PRICING)[number]

export const ORG_KINDS = ['business', 'coop', 'startup'] as const
export type OrgKind = (typeof ORG_KINDS)[number]

/** Fields a raise may ask a BRC-52/53 certificate to disclose. Nothing else is stored. */
export const CERT_FIELDS = ['jurisdiction', 'member', 'accredited', 'residency'] as const
export type CertField = (typeof CERT_FIELDS)[number]

export const KINDS = ['terms', 'eligibility', 'commit', 'close'] as const
export type RoundKind = (typeof KINDS)[number]

export const OPEN_REJECTION = 'This raise is still open. It is under the minimum until the deadline.'
export const CLOSED_REJECTION = 'This raise is already closed.'
export const DEADLINE_REJECTION = 'That deadline has passed.'
export const ELIGIBILITY_REJECTION = 'Prove eligibility before you commit.'
export const SELECTIVE_REJECTION = 'Disclose only the fields this raise asks for.'
export const MISSING_FIELD_REJECTION = 'A required field is missing.'
export const RESERVE_REJECTION = 'That bid is under the reserve.'
export const NEEDS_COMMIT_REJECTION = 'A raise needs a commitment before it can close.'

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const NONCE = /^[0-9a-f]{32}$/
const ROUND_ID = /^[0-9a-f]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const CERT_TEXT = /^[A-Za-z0-9._:-]{1,64}$/

export interface RoundTerms {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'terms'
  roundId: string
  name: string
  orgKind: OrgKind
  pricing: Pricing
  unitLabel: string
  /** Fixed price per unit, or the reserve price in a clearing auction. */
  priceSats: number
  minSats: number
  maxSats: number
  deadline: string
  /** Comma-separated CERT_FIELDS, in canonical order. */
  requiredFields: string
  issuerKey: string
  nonce: string
  openedAt: string
  /** ECDSA by the issuer's `round` key, counterparty anyone. Empty until record. */
  signature: string
}

export interface EligibilityRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'eligibility'
  roundId: string
  backerKey: string
  certifierKey: string
  certificateType: string
  serialNumber: string
  /** `field=value` pairs, only the required fields, in CERT_FIELDS order. */
  disclosed: string
  disclosedAt: string
  signature: string
}

export interface CommitRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'commit'
  roundId: string
  commitId: string
  backerKey: string
  nonce: string
  sats: number
  bidPriceSats: number
  committedAt: string
  signature: string
}

export interface SettlementLine {
  backerKey: string
  commitId: string
  committedSats: number
  acceptedSats: number
  refundSats: number
  units: number
  bidPriceSats: number
  qualified: boolean
}

export interface CloseRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'close'
  roundId: string
  outcome: 'refund' | 'settled'
  qualifiedSats: number
  acceptedSats: number
  clearingPriceSats: number
  registerId: string
  lines: string
  closedAt: string
  signature: string
}

export type RoundPayload = RoundTerms | EligibilityRecord | CommitRecord | CloseRecord

export interface Allocation {
  outcome: 'open' | 'refund' | 'settled' | 'pending'
  qualifiedSats: number
  acceptedSats: number
  clearingPriceSats: number
  lines: SettlementLine[]
}

export interface DeskState {
  terms: RoundTerms | null
  eligibilities: EligibilityRecord[]
  commits: CommitRecord[]
  close: CloseRecord | null
  rejection: string | null
}

export interface ChainRecord {
  txid: string
  vout: number
  lockingPublicKey: string
  payload: RoundPayload
  /**
   * Overlay admission or block time. ISO-8601.
   * This is the moment the public book uses. A stated time cannot move a record earlier than this.
   */
  txAt?: string
  /**
   * Transaction nLockTime. Unix values (at or above 500000000) are a not-before.
   * A value at or after the deadline proves the tx was late. A lower value does not prove it was early.
   */
  lockTime?: number
}

/** On-chain or overlay evidence for one record. Stated times are not evidence. */
export interface TxStamp {
  txAt?: string
  lockTime?: number
}

export interface AllocateOptions {
  /** Public-book read. Stated times do not prove order or the deadline. */
  fromChain?: boolean
  commitStamps?: ReadonlyMap<string, TxStamp>
  eligibilityStamps?: ReadonlyMap<string, TxStamp>
  closeStamp?: TxStamp
}

const LOCKTIME_UNIX = 500_000_000

export function eligibilityStampKey(row: Pick<EligibilityRecord, 'backerKey' | 'disclosedAt' | 'serialNumber'>): string {
  return `${row.backerKey.toLowerCase()}|${row.disclosedAt}|${row.serialNumber}`
}

export function txEvidenceAt(stamp: TxStamp | undefined): string | null {
  if (!stamp?.txAt || !isIsoDateTime(stamp.txAt)) return null
  return stamp.txAt
}

/** Unix nLockTime as an ISO not-before. Null when lockTime is unset or a block height. */
export function lockTimeBound(lockTime: number | undefined): string | null {
  if (lockTime == null || lockTime < LOCKTIME_UNIX) return null
  const ms = lockTime * 1000
  if (!Number.isSafeInteger(ms)) return null
  const iso = new Date(ms).toISOString()
  return isIsoDateTime(iso) ? iso : null
}

/**
 * Moment a chain record may use. Overlay time wins.
 * nLockTime is returned only as a lower bound, and only so a late bound can fail the deadline.
 * Null means the tx does not prove a moment — do not fall back to the stated time.
 */
export function provenInstant(stamp: TxStamp | undefined): string | null {
  return txEvidenceAt(stamp) ?? lockTimeBound(stamp?.lockTime)
}

/** Host context or a lock time at/after the deadline. No context is unproven, not a refund. */
function chainTiming(deadline: string, stamp: TxStamp | undefined): 'early' | 'late' | 'unproven' {
  const txAt = txEvidenceAt(stamp)
  if (txAt) return Date.parse(txAt) < Date.parse(deadline) ? 'early' : 'late'
  const bound = lockTimeBound(stamp?.lockTime)
  if (bound && Date.parse(bound) >= Date.parse(deadline)) return 'late'
  return 'unproven'
}

function onTime(stated: string, deadline: string, stamp: TxStamp | undefined, fromChain: boolean): boolean {
  if (!fromChain) return isIsoDateTime(stated) && Date.parse(stated) < Date.parse(deadline)
  return chainTiming(deadline, stamp) === 'early'
}

function orderAt(stated: string, stamp: TxStamp | undefined, fromChain: boolean, tie: string): string {
  if (!fromChain) return stated
  return txEvidenceAt(stamp) ?? lockTimeBound(stamp?.lockTime) ?? tie
}

export interface ReadOptions {
  roundId?: string
  hintTxid?: string | null
  pinIdentity?: string | null
}

export interface ListedRound {
  roundId: string
  txid: string | null
  terms: RoundTerms
  outcome: 'open' | 'refund' | 'settled' | 'pending'
  qualifiedSats: number
}

export interface RegistryIssue {
  magic: typeof REGISTRY_MAGIC
  version: '1'
  kind: 'issue'
  registerId: string
  issueId: string
  holder: string
  units: number
  admin: string
  issuedAt: string
}

export interface RegistryHandoff {
  kind: 'registry-handoff'
  registerId: string
  name: string
  unitLabel: string
  admin: string
  createdAt: string
  issues: RegistryIssue[]
}

export interface SettlementPayment {
  role: 'proceeds' | 'refund'
  identityKey: string
  satoshis: number
}

export interface OpenInput {
  name: string
  orgKind: OrgKind
  pricing: Pricing
  unitLabel: string
  priceSats: number
  minSats: number
  maxSats: number
  deadline: string
  requiredFields: readonly string[]
  issuerKey?: string
}

export interface DiscloseInput {
  backerKey: string
  certifierKey: string
  certificateType: string
  serialNumber: string
  fields: Record<string, string>
}

export interface CommitInput {
  backerKey: string
  sats: number
  bidPriceSats?: number
}

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isRoundId(value: string): boolean {
  return ROUND_ID.test(value.trim())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  return !Number.isNaN(new Date(trimmed).getTime())
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

const FIELD_PRIME = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn

function modPow(base: bigint, exponent: bigint): bigint {
  let result = 1n
  let cursor = base
  let exp = exponent
  while (exp > 0n) {
    if ((exp & 1n) !== 0n) result = (result * cursor) % FIELD_PRIME
    cursor = (cursor * cursor) % FIELD_PRIME
    exp >>= 1n
  }
  return result
}

/** True only for a compressed secp256k1 point. A regex-shaped sample key is not enough. */
export function isCurvePoint(value: string): boolean {
  const key = value.trim().toLowerCase()
  if (!/^(02|03)[0-9a-f]{64}$/.test(key)) return false
  const x = BigInt(`0x${key.slice(2)}`)
  if (x >= FIELD_PRIME) return false
  const square = (x * x * x + 7n) % FIELD_PRIME
  const y = modPow(square, (FIELD_PRIME + 1n) >> 2n)
  return (y * y) % FIELD_PRIME === square
}

export function isSpendableKey(value: string): boolean {
  return isCurvePoint(value)
}

export function identityFor(label: string): string {
  const name = label.trim().toLowerCase()
  for (let salt = 0; salt < 64; salt += 1) {
    const digest = sha256Hex(`round-desk\n${name}\n${salt}`)
    const key = `02${digest}`
    if (!isCurvePoint(key)) return key
  }
  return `02${'11'.repeat(32)}`
}

export const SAMPLE_CERTIFIER = identityFor('local-certifier')
export const SAMPLE_BACKER = identityFor('ada')

/** SHA-256 hex of the lowercase issuer key concatenated with the lowercase nonce. */
export function roundIdFor(issuerKey: string, nonce: string): string {
  const key = issuerKey.trim().toLowerCase()
  const idNonce = nonce.trim().toLowerCase()
  if (!isIdentityKey(key) || !NONCE.test(idNonce)) throw new Error('Round id is missing.')
  return sha256Hex(`${key}${idNonce}`)
}

/** SHA-256 hex of the lowercase backer key concatenated with the lowercase nonce. */
export function commitIdFor(backerKey: string, nonce: string): string {
  const key = backerKey.trim().toLowerCase()
  const idNonce = nonce.trim().toLowerCase()
  if (!isIdentityKey(key) || !NONCE.test(idNonce)) throw new Error('Commit id is missing.')
  return sha256Hex(`${key}${idNonce}`)
}

export function roundIdMatches(terms: Pick<RoundTerms, 'roundId' | 'issuerKey' | 'nonce'>): boolean {
  try {
    return terms.roundId === roundIdFor(terms.issuerKey, terms.nonce)
  } catch {
    return false
  }
}

export function commitIdMatches(commit: Pick<CommitRecord, 'commitId' | 'backerKey' | 'nonce'>): boolean {
  try {
    return commit.commitId === commitIdFor(commit.backerKey, commit.nonce)
  } catch {
    return false
  }
}

/** Registry register ids are 32 hex. This one is bound to the round id. */
export function registerIdFor(roundId: string): string {
  if (!isRoundId(roundId)) throw new Error('Round id is missing.')
  return sha256Hex(`registry\n${roundId.toLowerCase()}`).slice(0, 32)
}

export function escrowKeyId(roundId: string): string {
  if (!isRoundId(roundId)) throw new Error('Round id is missing.')
  return `escrow-${roundId.toLowerCase()}`
}

/**
 * Public child of an identity key. Counterparty is `anyone`, so any reader
 * can compute the child from the public key alone.
 */
export function derivedLockingKey(identityKey: string, keyID: string): string {
  if (!isIdentityKey(identityKey)) throw new Error('Identity key is invalid.')
  return new KeyDeriver('anyone')
    .derivePublicKey(PROTOCOL_ID, keyID, PublicKey.fromString(identityKey.trim()))
    .toString()
}

export function escrowLockingKey(issuerKey: string, roundId: string): string {
  return derivedLockingKey(issuerKey, escrowKeyId(roundId))
}

export function sameKey(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function signingInvoice(): string {
  return `${PROTOCOL_ID[0]}-${PROTOCOL_ID[1]}-${SIGNING_KEY_ID}`
}

/** Public half of createSignature with counterparty `anyone`. */
export function derivedSigningKey(identityKey: string): PublicKey | null {
  if (!isIdentityKey(identityKey)) return null
  try {
    return PublicKey.fromString(identityKey.trim()).deriveChild(new PrivateKey(1), signingInvoice())
  } catch {
    return null
  }
}

export function emptyDesk(): DeskState {
  return { terms: null, eligibilities: [], commits: [], close: null, rejection: null }
}

export function canonicalRequired(fields: readonly string[]): string {
  if (fields.length < 1) throw new Error('Pick at least one certificate field.')
  const unique = new Set(fields)
  if (unique.size !== fields.length) throw new Error('Certificate fields must be unique.')
  for (const field of unique) {
    if (!(CERT_FIELDS as readonly string[]).includes(field)) {
      throw new Error('That is not a certificate field this desk knows.')
    }
  }
  return CERT_FIELDS.filter((field) => unique.has(field)).join(',')
}

export function requiredFieldList(required: string): CertField[] {
  return required.split(',').filter((field): field is CertField => (CERT_FIELDS as readonly string[]).includes(field))
}

/** Keep only the fields the raise asked for. Extra fields are refused. */
export function canonicalDisclosure(required: string, values: Record<string, string>): string {
  const need = requiredFieldList(required)
  if (need.length < 1) throw new Error('Pick at least one certificate field.')
  const allowed = new Set<string>(need)
  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) throw new Error(SELECTIVE_REJECTION)
  }
  const parts: string[] = []
  for (const field of need) {
    const value = (values[field] ?? '').trim()
    if (!value) throw new Error(MISSING_FIELD_REJECTION)
    if (value.length > FIELD_VALUE_MAX || /[=;,\n|]/.test(value)) {
      throw new Error('That field value will not fit the disclosure.')
    }
    parts.push(`${field}=${value}`)
  }
  return parts.join(';')
}

export function disclosureMatches(required: string, disclosed: string): boolean {
  try {
    const again = canonicalDisclosure(required, Object.fromEntries(
      disclosed.split(';').filter(Boolean).map((part) => {
        const eq = part.indexOf('=')
        return [part.slice(0, eq), part.slice(eq + 1)]
      })
    ))
    return again === disclosed
  } catch {
    return false
  }
}

function assertKey(value: string, label: string): string {
  const key = value.trim().toLowerCase()
  if (!isIdentityKey(key)) throw new Error(`${label} identity is missing.`)
  return key
}

function assertSats(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < MIN_SATS || value > MAX_SATS) {
    throw new Error(`Enter ${label} in sats.`)
  }
  return value
}

function assertText(value: string, label: string, max: number): string {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length > max || /[\n\r]/.test(trimmed)) {
    throw new Error(`${label} is missing.`)
  }
  return trimmed
}

function assertCertText(value: string, label: string): string {
  const trimmed = value.trim()
  if (!CERT_TEXT.test(trimmed) || trimmed.length > CERT_TEXT_MAX) {
    throw new Error(`${label} is missing.`)
  }
  return trimmed
}

function signatureShape(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return /^[0-9a-f]+$/.test(trimmed) && trimmed.length >= 16 && trimmed.length % 2 === 0
}

export function openRound(input: OpenInput, openedAt: string, nonce: string): DeskState {
  if (!isIsoDateTime(openedAt)) throw new Error('Open time is missing.')
  if (!NONCE.test(nonce.trim().toLowerCase())) throw new Error('Nonce is missing.')
  if (!isIsoDateTime(input.deadline)) throw new Error('Enter a deadline.')
  if (Date.parse(input.deadline) <= Date.parse(openedAt)) throw new Error('The deadline has to be after the open.')
  const priceSats = assertSats(input.priceSats, 'a price')
  const minSats = assertSats(input.minSats, 'a minimum')
  const maxSats = assertSats(input.maxSats, 'a maximum')
  if (minSats > maxSats) throw new Error('The minimum has to be at or below the maximum.')
  if (!(ORG_KINDS as readonly string[]).includes(input.orgKind)) throw new Error('Pick a business, a co-op, or a startup.')
  if (!(PRICING as readonly string[]).includes(input.pricing)) throw new Error('Pick a fixed price or a clearing price.')
  const issuerKey = assertKey(input.issuerKey ?? identityFor('round-issuer'), 'Issuer')
  const terms: RoundTerms = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'terms',
    roundId: roundIdFor(issuerKey, nonce),
    name: assertText(input.name, 'Raise name', NAME_MAX),
    orgKind: input.orgKind,
    pricing: input.pricing,
    unitLabel: assertText(input.unitLabel, 'Unit label', UNIT_LABEL_MAX),
    priceSats,
    minSats,
    maxSats,
    deadline: input.deadline,
    requiredFields: canonicalRequired(input.requiredFields),
    issuerKey,
    nonce: nonce.trim().toLowerCase(),
    openedAt,
    signature: ''
  }
  return { ...emptyDesk(), terms }
}

function reject(desk: DeskState, message: string): DeskState {
  return { ...desk, rejection: message }
}

function requireOpen(desk: DeskState): RoundTerms | null {
  if (!desk.terms) return null
  if (desk.close) return null
  return desk.terms
}

export function disclose(desk: DeskState, input: DiscloseInput, at: string): DeskState {
  const terms = requireOpen(desk)
  if (!desk.terms) return reject(desk, 'Open a raise first.')
  if (!terms) return reject(desk, CLOSED_REJECTION)
  if (!isIsoDateTime(at)) return reject(desk, 'Disclosure time is missing.')
  if (Date.parse(at) >= Date.parse(terms.deadline)) return reject(desk, DEADLINE_REJECTION)
  let backerKey = ''
  let certifierKey = ''
  let disclosed = ''
  try {
    backerKey = assertKey(input.backerKey, 'Backer')
    certifierKey = assertKey(input.certifierKey, 'Certifier')
    disclosed = canonicalDisclosure(terms.requiredFields, input.fields)
  } catch (error) {
    return reject(desk, error instanceof Error ? error.message : SELECTIVE_REJECTION)
  }
  let certificateType = ''
  let serialNumber = ''
  try {
    certificateType = assertCertText(input.certificateType, 'Certificate type')
    serialNumber = assertCertText(input.serialNumber, 'Serial number')
  } catch (error) {
    return reject(desk, error instanceof Error ? error.message : 'Certificate is missing.')
  }
  const row: EligibilityRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'eligibility',
    roundId: terms.roundId,
    backerKey,
    certifierKey,
    certificateType,
    serialNumber,
    disclosed,
    disclosedAt: at,
    signature: ''
  }
  const eligibilities = [
    ...desk.eligibilities.filter((item) => !sameKey(item.backerKey, backerKey)),
    row
  ]
  return { ...desk, eligibilities, rejection: null }
}

export function commitToRound(desk: DeskState, input: CommitInput, at: string, nonce: string): DeskState {
  const terms = requireOpen(desk)
  if (!desk.terms) return reject(desk, 'Open a raise first.')
  if (!terms) return reject(desk, CLOSED_REJECTION)
  if (!isIsoDateTime(at)) return reject(desk, 'Commit time is missing.')
  if (Date.parse(at) >= Date.parse(terms.deadline)) return reject(desk, DEADLINE_REJECTION)
  if (!NONCE.test(nonce.trim().toLowerCase())) return reject(desk, 'Nonce is missing.')
  let backerKey = ''
  try {
    backerKey = assertKey(input.backerKey, 'Backer')
  } catch (error) {
    return reject(desk, error instanceof Error ? error.message : 'Backer identity is missing.')
  }
  const eligible = desk.eligibilities.some((row) => sameKey(row.backerKey, backerKey) && disclosureMatches(terms.requiredFields, row.disclosed))
  if (!eligible) return reject(desk, ELIGIBILITY_REJECTION)
  let sats = 0
  try {
    sats = assertSats(input.sats, 'an amount')
  } catch (error) {
    return reject(desk, error instanceof Error ? error.message : 'Enter an amount in sats.')
  }
  const bidPriceSats = terms.pricing === 'fixed' ? terms.priceSats : input.bidPriceSats ?? 0
  if (!Number.isSafeInteger(bidPriceSats) || bidPriceSats < MIN_SATS) {
    return reject(desk, 'Enter a bid in sats.')
  }
  if (terms.pricing === 'clearing' && bidPriceSats < terms.priceSats) {
    return reject(desk, RESERVE_REJECTION)
  }
  const row: CommitRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'commit',
    roundId: terms.roundId,
    commitId: commitIdFor(backerKey, nonce),
    backerKey,
    nonce: nonce.trim().toLowerCase(),
    sats,
    bidPriceSats,
    committedAt: at,
    signature: ''
  }
  const commits = [
    ...desk.commits.filter((item) => !sameKey(item.backerKey, backerKey)),
    row
  ]
  return { ...desk, commits, rejection: null }
}

/**
 * Allocation anyone can recompute from the signed records.
 * Under the minimum at the deadline: refund every commitment.
 * At or over the minimum: fill up to the maximum. Fixed price fills
 * oldest first. A clearing auction fills highest bid first, and every
 * accepted backer pays the lowest accepted bid.
 *
 * The local walkthrough may pass a clock as `at`. A public-book read
 * (`fromChain`) ignores stated times: overlay time orders the fill and
 * decides the deadline, and nLockTime can only prove a tx was late.
 */
export function allocateRound(
  terms: RoundTerms,
  commits: CommitRecord[],
  eligibilities: EligibilityRecord[],
  at: string,
  options: AllocateOptions = {}
): Allocation {
  const fromChain = options.fromChain === true
  const eligibilityByBacker = new Map<string, EligibilityRecord>()
  const eligibilityOrder = [...eligibilities].sort((left, right) => {
    const time = orderAt(left.disclosedAt, options.eligibilityStamps?.get(eligibilityStampKey(left)), fromChain, left.serialNumber)
      .localeCompare(orderAt(right.disclosedAt, options.eligibilityStamps?.get(eligibilityStampKey(right)), fromChain, right.serialNumber))
    return time !== 0 ? time : left.backerKey.localeCompare(right.backerKey)
  })
  for (const row of eligibilityOrder) {
    if (!sameKey(row.roundId, terms.roundId)) continue
    if (!disclosureMatches(terms.requiredFields, row.disclosed)) continue
    if (!onTime(row.disclosedAt, terms.deadline, options.eligibilityStamps?.get(eligibilityStampKey(row)), fromChain)) continue
    const key = row.backerKey.toLowerCase()
    if (!eligibilityByBacker.has(key)) eligibilityByBacker.set(key, row)
  }

  const byBacker = new Map<string, CommitRecord>()
  const commitOrder = [...commits].sort((left, right) => {
    const time = orderAt(left.committedAt, options.commitStamps?.get(left.commitId), fromChain, left.commitId)
      .localeCompare(orderAt(right.committedAt, options.commitStamps?.get(right.commitId), fromChain, right.commitId))
    return time !== 0 ? time : left.commitId.localeCompare(right.commitId)
  })
  for (const row of commitOrder) {
    if (!sameKey(row.roundId, terms.roundId)) continue
    if (!commitIdMatches(row)) continue
    const key = row.backerKey.toLowerCase()
    if (!byBacker.has(key)) byBacker.set(key, row)
  }
  const unique = [...byBacker.values()]

  const lines: SettlementLine[] = unique.map((row) => {
    const priceOk = terms.pricing === 'fixed'
      ? row.bidPriceSats === terms.priceSats
      : row.bidPriceSats >= terms.priceSats
    const inTime = onTime(row.committedAt, terms.deadline, options.commitStamps?.get(row.commitId), fromChain)
    const qualified = eligibilityByBacker.has(row.backerKey.toLowerCase()) && priceOk && row.sats >= 1 && inTime
    return {
      backerKey: row.backerKey.toLowerCase(),
      commitId: row.commitId,
      committedSats: row.sats,
      acceptedSats: 0,
      refundSats: row.sats,
      units: 0,
      bidPriceSats: row.bidPriceSats,
      qualified
    }
  })
  const qualifiedSats = lines.reduce((sum, line) => sum + (line.qualified ? line.committedSats : 0), 0)
  if (fromChain && unique.some((row) => chainTiming(terms.deadline, options.commitStamps?.get(row.commitId)) === 'unproven')) {
    return { outcome: 'pending', qualifiedSats: 0, acceptedSats: 0, clearingPriceSats: 0, lines }
  }
  const deadlinePassed = fromChain
    ? (() => {
      const instant = provenInstant(options.closeStamp)
      return instant != null && Date.parse(instant) >= Date.parse(terms.deadline)
    })()
    : Date.parse(at) >= Date.parse(terms.deadline)
  const refunded = (): Allocation => ({
    outcome: !deadlinePassed && qualifiedSats < terms.minSats ? 'open' : 'refund',
    qualifiedSats,
    acceptedSats: 0,
    clearingPriceSats: 0,
    lines
  })
  if (qualifiedSats < terms.minSats) {
    const early = refunded()
    return early.outcome === 'open' ? early : { ...early, outcome: 'refund' }
  }

  const fillOrder = lines
    .map((line, index) => ({ line, index }))
    .filter((item) => item.line.qualified)
    .sort((left, right) => {
      if (terms.pricing === 'clearing' && left.line.bidPriceSats !== right.line.bidPriceSats) {
        return right.line.bidPriceSats - left.line.bidPriceSats
      }
      const time = orderAt(
        unique[left.index].committedAt,
        options.commitStamps?.get(unique[left.index].commitId),
        fromChain,
        unique[left.index].commitId
      ).localeCompare(orderAt(
        unique[right.index].committedAt,
        options.commitStamps?.get(unique[right.index].commitId),
        fromChain,
        unique[right.index].commitId
      ))
      if (time !== 0) return time
      return left.line.commitId.localeCompare(right.line.commitId)
    })

  let remaining = terms.maxSats
  const provisional = new Map<string, number>()
  for (const item of fillOrder) {
    const take = Math.min(item.line.committedSats, remaining)
    provisional.set(item.line.commitId, take)
    remaining -= take
  }
  const accepted = fillOrder.filter((item) => (provisional.get(item.line.commitId) ?? 0) > 0)
  const clearingPriceSats = terms.pricing === 'fixed'
    ? terms.priceSats
    : (accepted.at(-1)?.line.bidPriceSats ?? terms.priceSats)

  let acceptedSats = 0
  let units = 0
  const settledLines = lines.map((line) => {
    if (!line.qualified) return line
    const taken = provisional.get(line.commitId) ?? 0
    const whole = Math.floor(taken / clearingPriceSats)
    const acceptedAmount = whole * clearingPriceSats
    acceptedSats += acceptedAmount
    units += whole
    return {
      ...line,
      acceptedSats: acceptedAmount,
      refundSats: line.committedSats - acceptedAmount,
      units: whole
    }
  })
  if (units < 1) {
    return { outcome: 'refund', qualifiedSats, acceptedSats: 0, clearingPriceSats: 0, lines }
  }
  return { outcome: 'settled', qualifiedSats, acceptedSats, clearingPriceSats, lines: settledLines }
}

export function encodeLines(lines: SettlementLine[]): string {
  return lines.map((line) => [
    line.backerKey,
    line.commitId,
    String(line.committedSats),
    String(line.acceptedSats),
    String(line.refundSats),
    String(line.units),
    String(line.bidPriceSats),
    line.qualified ? '1' : '0'
  ].join(',')).join('|')
}

export function parseCloseLines(value: string): SettlementLine[] | null {
  if (!value.trim()) return []
  const lines: SettlementLine[] = []
  for (const row of value.split('|')) {
    const parts = row.split(',')
    if (parts.length !== 8) return null
    const [backerKey, commitId, committed, accepted, refund, units, bid, flag] = parts
    if (!isIdentityKey(backerKey) || !isRoundId(commitId)) return null
    const numbers = [committed, accepted, refund, units, bid].map((part) => (/^\d+$/.test(part) ? Number(part) : Number.NaN))
    if (numbers.some((part) => !Number.isSafeInteger(part))) return null
    if (flag !== '0' && flag !== '1') return null
    const [committedSats, acceptedSats, refundSats, unitCount, bidPriceSats] = numbers
    if (acceptedSats + refundSats !== committedSats) return null
    lines.push({
      backerKey,
      commitId,
      committedSats,
      acceptedSats,
      refundSats,
      units: unitCount,
      bidPriceSats,
      qualified: flag === '1'
    })
  }
  return lines
}

function sortLines(lines: SettlementLine[]): SettlementLine[] {
  return [...lines].sort((left, right) => left.commitId.localeCompare(right.commitId))
}

export function settlementMatches(close: CloseRecord, allocation: Allocation): boolean {
  if (allocation.outcome === 'open' || allocation.outcome === 'pending' || close.outcome !== allocation.outcome) return false
  if (close.qualifiedSats !== allocation.qualifiedSats) return false
  if (close.acceptedSats !== allocation.acceptedSats) return false
  if (close.clearingPriceSats !== allocation.clearingPriceSats) return false
  const recorded = parseCloseLines(close.lines)
  if (!recorded) return false
  return JSON.stringify(sortLines(recorded)) === JSON.stringify(sortLines(allocation.lines))
}

export function closeRound(desk: DeskState, at: string): DeskState {
  if (!desk.terms) return reject(desk, 'Open a raise first.')
  if (desk.close) return reject(desk, CLOSED_REJECTION)
  if (!isIsoDateTime(at)) return reject(desk, 'Close time is missing.')
  if (desk.commits.length < 1) return reject(desk, NEEDS_COMMIT_REJECTION)
  const allocation = allocateRound(desk.terms, desk.commits, desk.eligibilities, at)
  if (allocation.outcome === 'open' || allocation.outcome === 'pending') return reject(desk, OPEN_REJECTION)
  const close: CloseRecord = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'close',
    roundId: desk.terms.roundId,
    outcome: allocation.outcome,
    qualifiedSats: allocation.qualifiedSats,
    acceptedSats: allocation.acceptedSats,
    clearingPriceSats: allocation.clearingPriceSats,
    registerId: registerIdFor(desk.terms.roundId),
    lines: encodeLines(allocation.lines),
    closedAt: at,
    signature: ''
  }
  return { ...desk, close, rejection: null }
}

export function settlementPayments(close: CloseRecord, issuerKey: string): SettlementPayment[] {
  const lines = parseCloseLines(close.lines) ?? []
  const payments: SettlementPayment[] = []
  if (close.outcome === 'settled' && close.acceptedSats > 0) {
    payments.push({ role: 'proceeds', identityKey: issuerKey.trim().toLowerCase(), satoshis: close.acceptedSats })
  }
  for (const line of lines) {
    if (line.refundSats > 0) {
      payments.push({ role: 'refund', identityKey: line.backerKey, satoshis: line.refundSats })
    }
  }
  return payments
}

export function paymentsBalance(close: CloseRecord, issuerKey: string): boolean {
  const lines = parseCloseLines(close.lines)
  if (!lines) return false
  const committed = lines.reduce((sum, line) => sum + line.committedSats, 0)
  const paid = settlementPayments(close, issuerKey).reduce((sum, row) => sum + row.satoshis, 0)
  return paid === committed
}

export function handoffIssueId(registerId: string, holder: string, units: number, issuedAt: string): string {
  return sha256Hex(['issue', registerId, holder.toLowerCase(), String(units), issuedAt].join('\n'))
}

/** Holdings for Registry Desk. Refunds issue nothing. There is no transfer. */
export function registryHandoff(terms: RoundTerms, close: CloseRecord): RegistryHandoff | null {
  if (close.outcome !== 'settled') return null
  if (!sameKey(close.roundId, terms.roundId)) return null
  const lines = parseCloseLines(close.lines)
  if (!lines) return null
  const issues: RegistryIssue[] = lines.filter((line) => line.units > 0).map((line) => ({
    magic: REGISTRY_MAGIC,
    version: '1',
    kind: 'issue',
    registerId: close.registerId,
    issueId: handoffIssueId(close.registerId, line.backerKey, line.units, close.closedAt),
    holder: line.backerKey,
    units: line.units,
    admin: terms.issuerKey.toLowerCase(),
    issuedAt: close.closedAt
  }))
  return {
    kind: 'registry-handoff',
    registerId: close.registerId,
    name: terms.name,
    unitLabel: terms.unitLabel,
    admin: terms.issuerKey.toLowerCase(),
    createdAt: close.closedAt,
    issues
  }
}

export function handoffJson(terms: RoundTerms, close: CloseRecord): string {
  const handoff = registryHandoff(terms, close)
  if (!handoff) {
    return JSON.stringify({
      kind: 'refund',
      roundId: close.roundId,
      lines: parseCloseLines(close.lines),
      note: 'Every backer is refunded. No holdings are issued. This is not a secondary market.'
    }, null, 2)
  }
  return JSON.stringify({
    ...handoff,
    note: 'Holdings for Registry Desk. Round Desk does not transfer them and does not run a secondary market.'
  }, null, 2)
}

function termsMessage(terms: RoundTerms): number[] {
  return stringToUtf8Bytes([
    'round',
    'terms',
    terms.roundId,
    terms.name,
    terms.orgKind,
    terms.pricing,
    terms.unitLabel,
    String(terms.priceSats),
    String(terms.minSats),
    String(terms.maxSats),
    terms.deadline,
    terms.requiredFields,
    terms.issuerKey,
    terms.nonce,
    terms.openedAt
  ].join('\n'))
}

function eligibilityMessage(row: EligibilityRecord): number[] {
  return stringToUtf8Bytes([
    'round',
    'eligibility',
    row.roundId,
    row.backerKey,
    row.certifierKey,
    row.certificateType,
    row.serialNumber,
    row.disclosed,
    row.disclosedAt
  ].join('\n'))
}

function commitMessage(row: CommitRecord): number[] {
  return stringToUtf8Bytes([
    'round',
    'commit',
    row.roundId,
    row.commitId,
    row.backerKey,
    row.nonce,
    String(row.sats),
    String(row.bidPriceSats),
    row.committedAt
  ].join('\n'))
}

function closeMessage(row: CloseRecord): number[] {
  return stringToUtf8Bytes([
    'round',
    'close',
    row.roundId,
    row.outcome,
    String(row.qualifiedSats),
    String(row.acceptedSats),
    String(row.clearingPriceSats),
    row.registerId,
    row.lines,
    row.closedAt
  ].join('\n'))
}

export function recordMessage(payload: RoundPayload): number[] {
  if (payload.kind === 'terms') return termsMessage(payload)
  if (payload.kind === 'eligibility') return eligibilityMessage(payload)
  if (payload.kind === 'commit') return commitMessage(payload)
  return closeMessage(payload)
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

export function termsSignedByIssuer(terms: RoundTerms): boolean {
  return roundIdMatches(terms) && signatureOk(terms.issuerKey, termsMessage(terms), terms.signature)
}

export function payloadSignedByIssuer(payload: RoundPayload, issuerKey: string): boolean {
  return signatureOk(issuerKey, recordMessage(payload), payload.signature)
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

/** Point the raise at sha256(issuerKey || nonce), then sign every record. */
export async function signRecordedDesk(wallet: RecordSigner, desk: DeskState): Promise<DeskState> {
  if (!desk.terms) throw new Error('Open a raise first.')
  const { publicKey } = await wallet.getPublicKey({ identityKey: true })
  const issuerKey = assertKey(publicKey, 'Issuer')
  const roundId = roundIdFor(issuerKey, desk.terms.nonce)
  const termsDraft: RoundTerms = { ...desk.terms, issuerKey, roundId, signature: '' }
  const terms: RoundTerms = { ...termsDraft, signature: await walletSig(wallet, termsMessage(termsDraft)) }
  const eligibilities: EligibilityRecord[] = []
  for (const row of desk.eligibilities) {
    const draft: EligibilityRecord = { ...row, roundId, signature: '' }
    eligibilities.push({ ...draft, signature: await walletSig(wallet, eligibilityMessage(draft)) })
  }
  const commits: CommitRecord[] = []
  for (const row of desk.commits) {
    const draft: CommitRecord = { ...row, roundId, signature: '' }
    commits.push({ ...draft, signature: await walletSig(wallet, commitMessage(draft)) })
  }
  let close: CloseRecord | null = null
  if (desk.close) {
    const draft: CloseRecord = {
      ...desk.close,
      roundId,
      registerId: registerIdFor(roundId),
      signature: ''
    }
    close = { ...draft, signature: await walletSig(wallet, closeMessage(draft)) }
  }
  return { terms, eligibilities, commits, close, rejection: null }
}

function validateTerms(terms: RoundTerms): string | null {
  if (terms.magic !== MAGIC || terms.kind !== 'terms') return 'Not round terms.'
  if (!roundIdMatches(terms)) return 'Round id does not match the issuer key.'
  if (!isIsoDateTime(terms.openedAt) || !isIsoDateTime(terms.deadline)) return 'Time is missing.'
  if (Date.parse(terms.deadline) <= Date.parse(terms.openedAt)) return 'The deadline has to be after the open.'
  if (!(ORG_KINDS as readonly string[]).includes(terms.orgKind)) return 'Org is missing.'
  if (!(PRICING as readonly string[]).includes(terms.pricing)) return 'Pricing is missing.'
  if (!Number.isSafeInteger(terms.priceSats) || terms.priceSats < MIN_SATS) return 'Price is missing.'
  if (!Number.isSafeInteger(terms.minSats) || !Number.isSafeInteger(terms.maxSats)) return 'Minimum is missing.'
  if (terms.minSats < MIN_SATS || terms.maxSats > MAX_SATS || terms.minSats > terms.maxSats) return 'Minimum is missing.'
  if (!terms.name.trim() || terms.name.length > NAME_MAX) return 'Raise name is missing.'
  if (!terms.unitLabel.trim() || terms.unitLabel.length > UNIT_LABEL_MAX) return 'Unit label is missing.'
  if (!disclosureShape(terms.requiredFields)) return 'Certificate fields are missing.'
  if (!signatureShape(terms.signature)) return 'Signature is missing.'
  return null
}

function disclosureShape(required: string): boolean {
  try {
    return canonicalRequired(required.split(',')) === required
  } catch {
    return false
  }
}

function validateEligibility(row: EligibilityRecord): string | null {
  if (row.magic !== MAGIC || row.kind !== 'eligibility') return 'Not eligibility.'
  if (!isRoundId(row.roundId) || !isIdentityKey(row.backerKey) || !isIdentityKey(row.certifierKey)) return 'Identity is missing.'
  if (!CERT_TEXT.test(row.certificateType) || !CERT_TEXT.test(row.serialNumber)) return 'Certificate is missing.'
  if (!isIsoDateTime(row.disclosedAt)) return 'Disclosure time is missing.'
  if (!signatureShape(row.signature)) return 'Signature is missing.'
  return null
}

function validateCommit(row: CommitRecord): string | null {
  if (row.magic !== MAGIC || row.kind !== 'commit') return 'Not a commitment.'
  if (!commitIdMatches(row) || !isRoundId(row.roundId)) return 'Commit id does not match the backer key.'
  if (!Number.isSafeInteger(row.sats) || row.sats < MIN_SATS || row.sats > MAX_SATS) return 'Amount is missing.'
  if (!Number.isSafeInteger(row.bidPriceSats) || row.bidPriceSats < MIN_SATS) return 'Bid is missing.'
  if (!isIsoDateTime(row.committedAt)) return 'Commit time is missing.'
  if (!signatureShape(row.signature)) return 'Signature is missing.'
  return null
}

function validateClose(row: CloseRecord): string | null {
  if (row.magic !== MAGIC || row.kind !== 'close') return 'Not a close.'
  if (!isRoundId(row.roundId)) return 'Round id is missing.'
  if (row.outcome !== 'refund' && row.outcome !== 'settled') return 'Outcome is missing.'
  if (row.registerId !== registerIdFor(row.roundId)) return 'Register id does not match the round.'
  if (!parseCloseLines(row.lines)) return 'Allocation lines are missing.'
  if (!isIsoDateTime(row.closedAt)) return 'Close time is missing.'
  if (!signatureShape(row.signature)) return 'Signature is missing.'
  return null
}

function encodeHead(kind: RoundKind, roundId: string): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(kind),
    stringToUtf8Bytes(roundId)
  ]
}

export function encodeTermsFields(terms: RoundTerms): number[][] {
  const invalid = validateTerms(terms)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('terms', terms.roundId),
    stringToUtf8Bytes(terms.name),
    stringToUtf8Bytes(terms.orgKind),
    stringToUtf8Bytes(terms.pricing),
    stringToUtf8Bytes(terms.unitLabel),
    stringToUtf8Bytes(String(terms.priceSats)),
    stringToUtf8Bytes(String(terms.minSats)),
    stringToUtf8Bytes(String(terms.maxSats)),
    stringToUtf8Bytes(terms.deadline),
    stringToUtf8Bytes(terms.requiredFields),
    stringToUtf8Bytes(terms.issuerKey),
    stringToUtf8Bytes(terms.nonce),
    stringToUtf8Bytes(terms.openedAt),
    stringToUtf8Bytes(terms.signature)
  ]
}

export function encodeEligibilityFields(row: EligibilityRecord): number[][] {
  const invalid = validateEligibility(row)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('eligibility', row.roundId),
    stringToUtf8Bytes(row.backerKey),
    stringToUtf8Bytes(row.certifierKey),
    stringToUtf8Bytes(row.certificateType),
    stringToUtf8Bytes(row.serialNumber),
    stringToUtf8Bytes(row.disclosed),
    stringToUtf8Bytes(row.disclosedAt),
    stringToUtf8Bytes(row.signature)
  ]
}

export function encodeCommitFields(row: CommitRecord): number[][] {
  const invalid = validateCommit(row)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('commit', row.roundId),
    stringToUtf8Bytes(row.commitId),
    stringToUtf8Bytes(row.backerKey),
    stringToUtf8Bytes(row.nonce),
    stringToUtf8Bytes(String(row.sats)),
    stringToUtf8Bytes(String(row.bidPriceSats)),
    stringToUtf8Bytes(row.committedAt),
    stringToUtf8Bytes(row.signature)
  ]
}

export function encodeCloseFields(row: CloseRecord): number[][] {
  const invalid = validateClose(row)
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('close', row.roundId),
    stringToUtf8Bytes(row.outcome),
    stringToUtf8Bytes(String(row.qualifiedSats)),
    stringToUtf8Bytes(String(row.acceptedSats)),
    stringToUtf8Bytes(String(row.clearingPriceSats)),
    stringToUtf8Bytes(row.registerId),
    stringToUtf8Bytes(row.lines),
    stringToUtf8Bytes(row.closedAt),
    stringToUtf8Bytes(row.signature)
  ]
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
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

function whole(value: string): number | null {
  if (!/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function parseRoundFields(fields: Array<number[] | Uint8Array>): RoundPayload | null {
  const semantic = semanticFields(fields)
  const start = semantic.findIndex((field) => {
    try {
      return fieldUtf8(field) === MAGIC
    } catch {
      return false
    }
  })
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3 || rest[0] !== SCHEMA_VERSION) return null
  const kind = rest[1]
  const roundId = rest[2]
  if (kind === 'terms') {
    if (rest.length < 16) return null
    const priceSats = whole(rest[7])
    const minSats = whole(rest[8])
    const maxSats = whole(rest[9])
    if (priceSats == null || minSats == null || maxSats == null) return null
    const terms: RoundTerms = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'terms',
      roundId,
      name: rest[3],
      orgKind: rest[4] as OrgKind,
      pricing: rest[5] as Pricing,
      unitLabel: rest[6],
      priceSats,
      minSats,
      maxSats,
      deadline: rest[10],
      requiredFields: rest[11],
      issuerKey: rest[12],
      nonce: rest[13],
      openedAt: rest[14],
      signature: rest[15]
    }
    return validateTerms(terms) ? null : terms
  }
  if (kind === 'eligibility') {
    if (rest.length < 10) return null
    const row: EligibilityRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'eligibility',
      roundId,
      backerKey: rest[3],
      certifierKey: rest[4],
      certificateType: rest[5],
      serialNumber: rest[6],
      disclosed: rest[7],
      disclosedAt: rest[8],
      signature: rest[9]
    }
    return validateEligibility(row) ? null : row
  }
  if (kind === 'commit') {
    if (rest.length < 10) return null
    const sats = whole(rest[6])
    const bidPriceSats = whole(rest[7])
    if (sats == null || bidPriceSats == null) return null
    const row: CommitRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'commit',
      roundId,
      commitId: rest[3],
      backerKey: rest[4],
      nonce: rest[5],
      sats,
      bidPriceSats,
      committedAt: rest[8],
      signature: rest[9]
    }
    return validateCommit(row) ? null : row
  }
  if (kind === 'close') {
    if (rest.length < 11) return null
    const qualifiedSats = whole(rest[4])
    const acceptedSats = whole(rest[5])
    const clearingPriceSats = whole(rest[6])
    if (qualifiedSats == null || acceptedSats == null || clearingPriceSats == null) return null
    const row: CloseRecord = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'close',
      roundId,
      outcome: rest[3] as CloseRecord['outcome'],
      qualifiedSats,
      acceptedSats,
      clearingPriceSats,
      registerId: rest[7],
      lines: rest[8],
      closedAt: rest[9],
      signature: rest[10]
    }
    return validateClose(row) ? null : row
  }
  return null
}

function lockOk(record: ChainRecord, issuerKey: string, roundId: string): boolean {
  if (!record.lockingPublicKey) return true
  try {
    return sameKey(record.lockingPublicKey, escrowLockingKey(issuerKey, roundId))
  } catch {
    return false
  }
}

function pickTerms(rows: ChainRecord[], options: ReadOptions): { terms: RoundTerms, txid: string } | null {
  const candidates = rows.filter((row) => {
    if (row.payload.kind !== 'terms') return false
    const terms = row.payload
    if (options.roundId && terms.roundId !== options.roundId) return false
    if (options.pinIdentity && !sameKey(terms.issuerKey, options.pinIdentity)) return false
    if (!termsSignedByIssuer(terms)) return false
    if (!lockOk(row, terms.issuerKey, terms.roundId)) return false
    return true
  })
  if (options.hintTxid) {
    const hinted = candidates.find((row) => row.txid.toLowerCase() === options.hintTxid?.toLowerCase())
    if (hinted && hinted.payload.kind === 'terms') return { terms: hinted.payload, txid: hinted.txid }
  }
  const sorted = [...candidates].sort((left, right) => {
    const a = provenInstant(chainStamp(left)) ?? left.txid
    const b = provenInstant(chainStamp(right)) ?? right.txid
    return a.localeCompare(b)
  })
  const first = sorted[0]
  if (!first || first.payload.kind !== 'terms') return null
  return { terms: first.payload, txid: first.txid }
}

function chainStamp(row: ChainRecord): TxStamp {
  return { txAt: row.txAt, lockTime: row.lockTime }
}

function chainAllocateOptions(rows: ChainRecord[]): AllocateOptions {
  const commitStamps = new Map<string, TxStamp>()
  const eligibilityStamps = new Map<string, TxStamp>()
  for (const row of rows) {
    if (row.payload.kind === 'commit') commitStamps.set(row.payload.commitId, chainStamp(row))
    if (row.payload.kind === 'eligibility') eligibilityStamps.set(eligibilityStampKey(row.payload), chainStamp(row))
  }
  return { fromChain: true, commitStamps, eligibilityStamps }
}

export function deskFromChain(rows: ChainRecord[], options: ReadOptions = {}): DeskState | null {
  const picked = pickTerms(rows, options)
  if (!picked) return null
  const { terms } = picked
  const related = rows.filter((row) => row.payload.roundId === terms.roundId && lockOk(row, terms.issuerKey, terms.roundId))
  const signedRows = related.filter((row) => payloadSignedByIssuer(row.payload, terms.issuerKey))
  const read = chainAllocateOptions(signedRows)
  const eligibilities: EligibilityRecord[] = []
  const eligibilityRows = signedRows
    .filter((row): row is ChainRecord & { payload: EligibilityRecord } => row.payload.kind === 'eligibility')
    .sort((left, right) => orderAt(left.payload.disclosedAt, chainStamp(left), true, left.txid).localeCompare(orderAt(right.payload.disclosedAt, chainStamp(right), true, right.txid)))
  for (const row of eligibilityRows) {
    const payload = row.payload
    if (!disclosureMatches(terms.requiredFields, payload.disclosed)) continue
    if (!onTime(payload.disclosedAt, terms.deadline, chainStamp(row), true)) continue
    if (!eligibilities.some((item) => sameKey(item.backerKey, payload.backerKey))) eligibilities.push(payload)
  }
  const commits: CommitRecord[] = []
  const commitRows = signedRows
    .filter((row): row is ChainRecord & { payload: CommitRecord } => row.payload.kind === 'commit')
    .sort((left, right) => orderAt(left.payload.committedAt, chainStamp(left), true, left.txid).localeCompare(orderAt(right.payload.committedAt, chainStamp(right), true, right.txid)))
  for (const row of commitRows) {
    const payload = row.payload
    if (!commitIdMatches(payload)) continue
    if (!commits.some((item) => sameKey(item.backerKey, payload.backerKey))) commits.push(payload)
  }
  const closeRows = signedRows
    .filter((row): row is ChainRecord & { payload: CloseRecord } => row.payload.kind === 'close')
    .sort((left, right) => {
      const a = provenInstant(chainStamp(left)) ?? left.txid
      const b = provenInstant(chainStamp(right)) ?? right.txid
      return a.localeCompare(b)
    })
  const close = closeRows
    .find((row) => settlementMatches(row.payload, allocateRound(terms, commits, eligibilities, row.payload.closedAt, {
      ...read,
      closeStamp: chainStamp(row)
    })))?.payload ?? null
  return { terms, eligibilities, commits, close, rejection: null }
}

export function bookFromChain(rows: ChainRecord[], pinIdentity?: string | null): ListedRound[] {
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.payload.kind === 'terms') ids.add(row.payload.roundId)
  }
  const listed: ListedRound[] = []
  const seenAt = new Map<string, string>()
  for (const roundId of ids) {
    const desk = deskFromChain(rows, { roundId, pinIdentity })
    if (!desk?.terms) continue
    const termsRow = rows.find((row) => row.payload.kind === 'terms' && row.payload.roundId === desk.terms?.roundId)
    const txid = termsRow?.txid ?? null
    const closeRow = desk.close
      ? rows.find((row) => row.payload.kind === 'close' && row.payload.signature === desk.close?.signature)
      : undefined
    const allocation = allocateRound(desk.terms, desk.commits, desk.eligibilities, desk.terms.deadline, {
      ...chainAllocateOptions(rows.filter((row) => row.payload.roundId === desk.terms?.roundId)),
      closeStamp: closeRow ? chainStamp(closeRow) : undefined
    })
    seenAt.set(desk.terms.roundId, txEvidenceAt(termsRow) ?? txid ?? '')
    listed.push({
      roundId: desk.terms.roundId,
      txid,
      terms: desk.terms,
      outcome: desk.close?.outcome ?? allocation.outcome,
      qualifiedSats: desk.close?.qualifiedSats ?? allocation.qualifiedSats
    })
  }
  listed.sort((left, right) => (seenAt.get(right.roundId) ?? '').localeCompare(seenAt.get(left.roundId) ?? ''))
  return listed
}
