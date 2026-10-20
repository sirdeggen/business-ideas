/**
 * Capture Desk protocol (PushDrop fields).
 *
 * A requester posts a capture of one place. The reward is locked before
 * anyone films. Contributors submit a receipt. The requester accepts one,
 * or takes a full refund after the deadline. MAGIC `capture`.
 * Public Pages uses tm_anytx / ls_anytx. Client filters on MAGIC.
 *
 * The request id is sha256(requesterIdentity || nonce). Readers recompute
 * it and drop a request whose id does not match that key, along with that
 * request's submissions, accept, and refund. Posted time is only a
 * tie-break among records from the same key. The canonical request is the
 * one named by `?tx=` when that param is present, otherwise the oldest
 * valid request from that key (`?p=` pins the key).
 *
 * The escrow lock key id is `escrow-<requestId>` and the counterparty is
 * `anyone`, so any reader re-derives it from the requester's public
 * identity. The request, the accept, and the refund are signed by that
 * derived key. A submission is signed by the contributor identity under
 * key id `capture` and counterparty `anyone`. Readers verify every
 * signature and drop unsigned or forged rows and duplicate requests.
 *
 * An accept names the submission's receipt hash. Readers check the accept
 * transaction's outputs: contributor, desk fee, and processing fee. The
 * script does not check that split. The reward is locked to the requester's key.
 *
 * Deadline checks use the block header time for the BEEF merkle proof.
 * Signer clocks, nLockTime, and host-asserted overlay times do not count.
 * With no matching header, a refund and a submission stay pending.
 *
 * Raw footage is never a field. Only the hash and the receipt are.
 *
 * Not Job Escrow (one hired worker). Not Bounty (a security report with
 * commit-reveal). Not Datasets (selling data that already exists).
 * Not Trace (provenance of a record).
 */

import { BigNumber, ECDSA, Hash, KeyDeriver, MerklePath, P2PKH, PublicKey, Signature, Utils } from '@bsv/sdk'
import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'capture']
export const BASKET = 'capture'
export const MAGIC = 'capture'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'capture'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'

export const LOCATION_MAX = 120
export const BRIEF_MAX = 280
export const PREVIEW_MAX = 2_000
export const MIN_SATS = 1
export const MAX_SATS = 9_000_000_000_000
export const DESK_FEE_BPS = 1_000
export const DEFAULT_PROCESSING_FEE_SATS = 1_000
export const MIN_PROCESSING_FEE_SATS = 1
export const RECORD_SATS = 1
export const GEOHASH_PRECISION = 5

/**
 * Desk wallet identity. BRC-100 cannot sign this root, so fees are not a
 * P2PKH of the root. They are a P2PKH of the BRC-29 child below.
 */
export const DESK_FEE_KEY = '02c5313bc21f0a61418640c94a23d3cdb09ea50a8a3dd8daababe93f57a5fa0082'

/** BRC-29 payment protocol. Counterparty is `anyone`, so the child is public. */
export const BRC29_PROTOCOL: [2, string] = [2, '3241645161d8']

/** Stable key id for the desk fee child. The desk spends it with forSelf true. */
export const DESK_FEE_KEY_ID = 'capture-fee'

/** Contributor signing key. Counterparty is `anyone`. */
export const CONTRIBUTOR_KEY_ID = 'capture'

/** Payout child of the contributor identity. The contributor sweeps it with forSelf. */
export const CONTRIBUTOR_PAY_KEY_ID = 'capture-pay'

/** Refund child of the requester identity. The requester sweeps it with forSelf. */
export const REQUESTER_REFUND_KEY_ID = 'capture-refund'

/** The locking script does not read the deadline. Readers use header time. */
export const DEADLINE_ENFORCEMENT = 'header-time' as const

export const KINDS = ['request', 'submit', 'accept', 'refund'] as const
export type CaptureKind = (typeof KINDS)[number]

export const STATUSES = ['open', 'accepted', 'refunded', 'pending', 'spent'] as const
export type CaptureStatus = (typeof STATUSES)[number]

const REQUEST_ID = /^[0-9a-f]{64}$/
const NONCE = /^[0-9a-f]{32}$/
const HASH_HEX = /^[0-9a-f]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const GEOHASH = /^[0123456789bcdefghjkmnpqrstuvwxyz]{5}$/

export function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

export function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

export function isRequestId(value: string): boolean {
  return REQUEST_ID.test(value.trim().toLowerCase())
}

export function isNonce(value: string): boolean {
  return NONCE.test(value.trim().toLowerCase())
}

export function isReceiptHash(value: string): boolean {
  return HASH_HEX.test(value.trim().toLowerCase())
}

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isGeohash(value: string): boolean {
  return GEOHASH.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  return !Number.isNaN(new Date(trimmed).getTime())
}

export function newNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

/** sha256 of the requester identity concatenated with the nonce. Readers recompute this. */
export function boundRequestId(requesterIdentity: string, nonce: string): string {
  const identity = requesterIdentity.trim().toLowerCase()
  const salt = nonce.trim().toLowerCase()
  if (!isIdentityKey(identity) || !isNonce(salt)) throw new Error('Request id cannot be bound.')
  return sha256Hex(`${identity}${salt}`)
}

export function requestIdMatches(request: Pick<CaptureRequest, 'requestId' | 'requesterIdentity' | 'nonce'>): boolean {
  if (!request.requesterIdentity) return false
  if (!isIdentityKey(request.requesterIdentity) || !isNonce(request.nonce ?? '')) return false
  return request.requestId.toLowerCase() === boundRequestId(request.requesterIdentity, request.nonce)
}

export function escrowKeyId(requestId: string): string {
  if (!isRequestId(requestId)) throw new Error('Request id is missing.')
  return `escrow-${requestId.toLowerCase()}`
}

/**
 * Public child of an identity key. Counterparty is `anyone` (the point 1·G),
 * so any reader can compute the child from the public key alone.
 */
export function derivedLockingKey(identityKey: string, protocolID: [0 | 1 | 2, string], keyID: string): string {
  if (!isIdentityKey(identityKey)) throw new Error('Identity key is invalid.')
  return new KeyDeriver('anyone')
    .derivePublicKey(protocolID, keyID, PublicKey.fromString(identityKey.trim()))
    .toString()
}

export function escrowLockingKey(requesterIdentity: string, requestId: string): string {
  return derivedLockingKey(requesterIdentity, PROTOCOL_ID, escrowKeyId(requestId))
}

export function contributorSigningKey(contributorIdentity: string): string {
  return derivedLockingKey(contributorIdentity, PROTOCOL_ID, CONTRIBUTOR_KEY_ID)
}

/** P2PKH key for the desk fee and the processing fee. Not the desk wallet root. */
export function deskFeeLockingKey(): string {
  return derivedLockingKey(DESK_FEE_KEY, BRC29_PROTOCOL, DESK_FEE_KEY_ID)
}

/** P2PKH key paid to the contributor named on the signed submission. */
export function contributorPayoutKey(contributorIdentity: string): string {
  return derivedLockingKey(contributorIdentity, BRC29_PROTOCOL, CONTRIBUTOR_PAY_KEY_ID)
}

/** P2PKH key that receives a full refund. The requester sweeps it with forSelf. */
export function requesterRefundKey(requesterIdentity: string): string {
  return derivedLockingKey(requesterIdentity, BRC29_PROTOCOL, REQUESTER_REFUND_KEY_ID)
}

export function sameKey(left: string, right: string): boolean {
  const a = left.trim()
  const b = right.trim()
  return isIdentityKey(a) && isIdentityKey(b) && a.toLowerCase() === b.toLowerCase()
}

export interface CaptureRequest {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'request'
  requestId: string
  location: string
  brief: string
  rewardSats: number
  processingFeeSats: number
  deskFeeBps: number
  deadline: string
  requesterIdentity: string
  nonce: string
  postedAt: string
  signature: string
}

export interface CaptureSubmit {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'submit'
  requestId: string
  contributorIdentity: string
  receiptHash: string
  capturedAt: string
  geohash: string
  submittedAt: string
  signature: string
  /** Display only. A host-asserted overlay time. Not signed and not a clock. */
  hostAssertedAt?: string
}

export interface CaptureAccept {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'accept'
  requestId: string
  receiptHash: string
  contributorIdentity: string
  contributorSats: number
  deskFeeSats: number
  processingFeeSats: number
  acceptedAt: string
  signature: string
}

export interface CaptureRefund {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'refund'
  requestId: string
  refundSats: number
  refundedAt: string
  signature: string
}

export type CapturePayload = CaptureRequest | CaptureSubmit | CaptureAccept | CaptureRefund

export interface ChainOutput {
  satoshis: number
  lockingScript: string
}

/** A block header. Its time counts only when its merkle root matches the BEEF proof. */
export interface BlockHeaderTime {
  height: number
  /** Unix seconds from the block header. */
  time: number
  merkleRoot: string
}

export interface ChainRecord {
  txid: string
  vout: number
  inputs: string[]
  lockingPublicKey: string
  payload: CapturePayload
  outputs?: ChainOutput[]
  /** Block height from the BEEF merkle proof. Not a clock by itself. */
  blockHeight?: number
  /** Merkle root computed from that proof. */
  merkleRoot?: string
  /** Leaf index from that proof. Orders rows inside one block. */
  blockIndex?: number
  /** Host-supplied overlay time. Display only. */
  hostAssertedAt?: string
  /** Ignored. nLockTime is not the time a refund or a submission happened. */
  lockTime?: number
}

export interface ReadOptions {
  requestId?: string
  hintTxid?: string | null
  pinIdentity?: string | null
  headers?: BlockHeaderTime[]
  /** Outpoints seen spent in some transaction, including ones with no capture record. */
  spentOutpoints?: string[]
}

export interface DeskState {
  request: CaptureRequest | null
  /** Submissions whose header time is at or before the deadline. */
  submissions: CaptureSubmit[]
  /** Signed submissions with no header time. Not acceptable. */
  pendingSubmissions: CaptureSubmit[]
  /** Signed submissions whose header time is after the deadline. */
  lateSubmissions: CaptureSubmit[]
  accept: CaptureAccept | null
  /** A refund whose header time is after the deadline. */
  refund: CaptureRefund | null
  /** A signed refund with no header time. */
  pendingRefund: CaptureRefund | null
  /** A spend whose header time is not after the deadline. */
  earlyRefund: CaptureRefund | null
  /** The escrow outpoint is spent, and no accept or refund record explains it. */
  spent: boolean
  rejection: string | null
  notice: string | null
}

export interface RequestInput {
  location: string
  brief: string
  rewardSats: number
  processingFeeSats: number
  deadline: string
  requesterIdentity?: string
  nonce?: string
  postedAt?: string
}

export interface SubmitInput {
  contributorIdentity: string
  receiptHash: string
  capturedAt: string
  geohash: string
  submittedAt?: string
}

export interface PayoutLines {
  rewardSats: number
  deskFeeBps: number
  deskFeeSats: number
  processingFeeSats: number
  contributorSats: number
}

export interface ListedRequest {
  requestId: string
  request: CaptureRequest
  submissions: CaptureSubmit[]
  pendingSubmissions: CaptureSubmit[]
  lateSubmissions: CaptureSubmit[]
  accept: CaptureAccept | null
  refund: CaptureRefund | null
  pendingRefund: CaptureRefund | null
  earlyRefund: CaptureRefund | null
  txid: string
  status: CaptureStatus
  /** Header time of the fund and the accept. Signer clocks are not used. */
  trustedPostedAt?: string | null
  trustedAcceptAt?: string | null
}

export interface BoardStats {
  open: number
  accepted: number
  refunded: number
  pending: number
  spent: number
  acceptRate: number | null
  medianAcceptMs: number | null
}

export function hashCapture(body: string): string {
  return sha256Hex(body)
}

export function emptyDesk(): DeskState {
  return {
    request: null,
    submissions: [],
    pendingSubmissions: [],
    lateSubmissions: [],
    accept: null,
    refund: null,
    pendingRefund: null,
    earlyRefund: null,
    spent: false,
    rejection: null,
    notice: null
  }
}

export function keepMagic<T extends { magic: string }>(rows: T[]): T[] {
  return rows.filter((row) => row.magic === MAGIC)
}

function assertText(value: string, empty: string, max: number): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error(empty)
  if (trimmed.length > max) throw new Error(`Keep it to ${max} characters.`)
  if (/[\r\n]/.test(trimmed)) throw new Error('Keep that on one line.')
  return trimmed
}

function assertSats(value: number, label: string, min = MIN_SATS): void {
  if (!Number.isInteger(value) || value < min || value > MAX_SATS) {
    throw new Error(`Enter ${label} in sats.`)
  }
}

/** 10% of the reward, rounded down. 10,001 sats yields 1,000, not 1,001. */
export function deskFeeSats(rewardSats: number): number {
  assertSats(rewardSats, 'the reward', 1)
  return Math.floor((rewardSats * DESK_FEE_BPS) / 10_000)
}

export function payoutLines(rewardSats: number, processingFeeSats: number): PayoutLines {
  assertSats(rewardSats, 'the reward', 1)
  assertSats(processingFeeSats, 'the processing fee', MIN_PROCESSING_FEE_SATS)
  const fee = deskFeeSats(rewardSats)
  if (fee < 1) throw new Error('The desk fee floors to nothing. Raise the reward.')
  const contributorSats = rewardSats - fee - processingFeeSats
  if (contributorSats < 1) throw new Error('The fees leave nothing for the contributor.')
  if (contributorSats + fee + processingFeeSats !== rewardSats) {
    throw new Error('Payout lines do not add up to the reward.')
  }
  return {
    rewardSats,
    deskFeeBps: DESK_FEE_BPS,
    deskFeeSats: fee,
    processingFeeSats,
    contributorSats
  }
}

export function postRequest(input: RequestInput, now = nowIso()): DeskState {
  const location = assertText(input.location, 'Name the place.', LOCATION_MAX)
  const brief = assertText(input.brief, 'Write the brief.', BRIEF_MAX)
  const lines = payoutLines(input.rewardSats, input.processingFeeSats)
  const postedAt = input.postedAt ?? now
  const deadline = input.deadline.trim()
  if (!isIsoDateTime(postedAt)) throw new Error('Posted time is missing.')
  if (!isIsoDateTime(deadline)) throw new Error('Deadline is missing.')
  if (deadline <= postedAt) throw new Error('The deadline has to be after the request is posted.')
  const requesterIdentity = (input.requesterIdentity ?? '').trim().toLowerCase()
  if (requesterIdentity && !isIdentityKey(requesterIdentity)) throw new Error('Requester key is invalid.')
  const nonce = (input.nonce ?? '').trim().toLowerCase() || newNonce()
  if (!isNonce(nonce)) throw new Error('Nonce is invalid.')
  const requestId = requesterIdentity ? boundRequestId(requesterIdentity, nonce) : sha256Hex(nonce)
  const request: CaptureRequest = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'request',
    requestId,
    location,
    brief,
    rewardSats: lines.rewardSats,
    processingFeeSats: lines.processingFeeSats,
    deskFeeBps: DESK_FEE_BPS,
    deadline,
    requesterIdentity,
    nonce,
    postedAt,
    signature: ''
  }
  const invalid = validateRequest(request, { allowUnsigned: true })
  if (invalid) throw new Error(invalid)
  return {
    ...emptyDesk(),
    request,
    notice: 'Request drafted in this browser. The reward is not locked until you fund.'
  }
}

export function bindRequest(request: CaptureRequest, requesterIdentity: string): CaptureRequest {
  const identity = requesterIdentity.trim().toLowerCase()
  if (!isIdentityKey(identity)) throw new Error('Requester key is invalid.')
  const nonce = request.nonce.trim().toLowerCase()
  if (!isNonce(nonce)) throw new Error('Nonce is missing.')
  return {
    ...request,
    requesterIdentity: identity,
    nonce,
    requestId: boundRequestId(identity, nonce),
    signature: ''
  }
}

export function submitCapture(desk: DeskState, input: SubmitInput): DeskState {
  if (!desk.request) throw new Error('Fund a request first.')
  if (desk.accept) throw new Error('This request was already accepted.')
  if (desk.refund || desk.pendingRefund || desk.earlyRefund) throw new Error('This request was already refunded.')
  const contributorIdentity = input.contributorIdentity.trim().toLowerCase()
  if (!isIdentityKey(contributorIdentity)) throw new Error('Contributor key is invalid.')
  const receiptHash = input.receiptHash.trim().toLowerCase()
  if (!isReceiptHash(receiptHash)) throw new Error('Receipt hash is missing.')
  const geohash = input.geohash.trim().toLowerCase()
  if (!isGeohash(geohash)) throw new Error('Coarse location is a 5-character geohash.')
  const capturedAt = input.capturedAt.trim()
  const submittedAt = (input.submittedAt ?? nowIso()).trim()
  if (!isIsoDateTime(capturedAt)) throw new Error('Capture time is missing.')
  if (!isIsoDateTime(submittedAt)) throw new Error('Submitted time is missing.')
  const already = [...desk.submissions, ...desk.pendingSubmissions, ...desk.lateSubmissions]
  if (already.some((row) => sameKey(row.contributorIdentity, contributorIdentity) && row.receiptHash === receiptHash)) {
    throw new Error('That capture is already submitted.')
  }
  const submission: CaptureSubmit = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'submit',
    requestId: desk.request.requestId,
    contributorIdentity,
    receiptHash,
    capturedAt,
    geohash,
    submittedAt,
    signature: ''
  }
  const invalid = validateSubmit(submission, { allowUnsigned: true })
  if (invalid) throw new Error(invalid)
  return {
    ...desk,
    pendingSubmissions: [...desk.pendingSubmissions, submission],
    rejection: null,
    notice: 'Capture submitted in this browser. Send the watermarked preview over Message Box. The raw file stays with you. It stays pending until the network timestamps it.'
  }
}

export function assertPayout(submission: CaptureSubmit, payoutKey: string): void {
  const expected = contributorPayoutKey(submission.contributorIdentity)
  if (!sameKey(payoutKey, expected)) {
    throw new Error('The payout must go to the contributor who signed this capture.')
  }
}

export function acceptCapture(desk: DeskState, receiptHash: string, at = nowIso()): DeskState {
  if (!desk.request) throw new Error('Fund a request first.')
  if (desk.accept) throw new Error('This request was already accepted.')
  if (desk.refund || desk.pendingRefund || desk.earlyRefund) throw new Error('This request was already refunded.')
  const hash = receiptHash.trim().toLowerCase()
  const submission = desk.submissions.find((row) => row.receiptHash === hash)
  if (!submission) {
    const waiting = desk.pendingSubmissions.find((row) => row.receiptHash === hash)
      ?? desk.lateSubmissions.find((row) => row.receiptHash === hash)
    if (waiting) throw new Error('This capture is still pending. The network has not timestamped it yet.')
    throw new Error('Accept a capture that was submitted.')
  }
  if (!isIsoDateTime(at)) throw new Error('Accepted time is missing.')
  const lines = payoutLines(desk.request.rewardSats, desk.request.processingFeeSats)
  const accept: CaptureAccept = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'accept',
    requestId: desk.request.requestId,
    receiptHash: submission.receiptHash,
    contributorIdentity: submission.contributorIdentity,
    contributorSats: lines.contributorSats,
    deskFeeSats: lines.deskFeeSats,
    processingFeeSats: lines.processingFeeSats,
    acceptedAt: at,
    signature: ''
  }
  assertPayout(submission, contributorPayoutKey(accept.contributorIdentity))
  const invalid = validateAccept(accept, desk.request, { allowUnsigned: true })
  if (invalid) throw new Error(invalid)
  return {
    ...desk,
    accept,
    rejection: null,
    notice: 'Accepted in this browser. Readers check the three payments. The script only locks the reward to the requester\'s key.'
  }
}

/** Local draft guard. Readers do not use this clock. */
export function refundAllowed(request: CaptureRequest, at: string): boolean {
  if (!isIsoDateTime(at) || !isIsoDateTime(request.deadline)) return false
  return Date.parse(at) >= Date.parse(request.deadline)
}

export function refundCapture(desk: DeskState, at = nowIso()): DeskState {
  if (!desk.request) throw new Error('Fund a request first.')
  if (desk.accept) throw new Error('This request was already accepted.')
  if (desk.refund || desk.pendingRefund || desk.earlyRefund) throw new Error('This request was already refunded.')
  if (!isIsoDateTime(at)) throw new Error('Refund time is missing.')
  if (!refundAllowed(desk.request, at)) throw new Error('The deadline has not passed.')
  const refund: CaptureRefund = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'refund',
    requestId: desk.request.requestId,
    refundSats: desk.request.rewardSats,
    refundedAt: at,
    signature: ''
  }
  const invalid = validateRefund(refund, desk.request, { allowUnsigned: true })
  if (invalid) throw new Error(invalid)
  return {
    ...desk,
    pendingRefund: refund,
    rejection: null,
    notice: 'Refund drafted. Refunds count once the network timestamps them after the deadline.'
  }
}

export function requestMessage(request: CaptureRequest): number[] {
  return stringToUtf8Bytes([
    'request',
    request.requestId,
    request.location,
    request.brief,
    String(request.rewardSats),
    String(request.processingFeeSats),
    String(request.deskFeeBps),
    request.deadline,
    request.requesterIdentity,
    request.nonce,
    request.postedAt
  ].join('|'))
}

export function submitMessage(submit: CaptureSubmit): number[] {
  return stringToUtf8Bytes([
    'submit',
    submit.requestId,
    submit.contributorIdentity,
    submit.receiptHash,
    submit.capturedAt,
    submit.geohash,
    submit.submittedAt
  ].join('|'))
}

export function acceptMessage(accept: CaptureAccept): number[] {
  return stringToUtf8Bytes([
    'accept',
    accept.requestId,
    accept.receiptHash,
    accept.contributorIdentity,
    String(accept.contributorSats),
    String(accept.deskFeeSats),
    String(accept.processingFeeSats),
    accept.acceptedAt
  ].join('|'))
}

export function refundMessage(refund: CaptureRefund): number[] {
  return stringToUtf8Bytes([
    'refund',
    refund.requestId,
    String(refund.refundSats),
    refund.refundedAt
  ].join('|'))
}

function signatureOk(publicKey: string, message: number[], signature: string): boolean {
  if (!isIdentityKey(publicKey) || !/^[0-9a-fA-F]+$/.test(signature)) return false
  try {
    const hash = Hash.sha256(message)
    const sig = Signature.fromDER(Utils.toArray(signature, 'hex'))
    return ECDSA.verify(new BigNumber(hash), sig, PublicKey.fromString(publicKey))
  } catch {
    return false
  }
}

export function signedByEscrow(requesterIdentity: string, requestId: string, message: number[], signature: string): boolean {
  if (!isRequestId(requestId)) return false
  try {
    return signatureOk(escrowLockingKey(requesterIdentity, requestId), message, signature)
  } catch {
    return false
  }
}

export function signedByContributor(contributorIdentity: string, message: number[], signature: string): boolean {
  try {
    return signatureOk(contributorSigningKey(contributorIdentity), message, signature)
  } catch {
    return false
  }
}

export function requestLockedToRequester(
  lockingPublicKey: string,
  request: Pick<CaptureRequest, 'requesterIdentity' | 'requestId'>
): boolean {
  if (!isIdentityKey(request.requesterIdentity)) return false
  try {
    return sameKey(lockingPublicKey, escrowLockingKey(request.requesterIdentity, request.requestId))
  } catch {
    return false
  }
}

function encodeHead(kind: CaptureKind, requestId: string): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes(kind),
    stringToUtf8Bytes(requestId)
  ]
}

export function validateRequest(request: CaptureRequest, options: { allowUnsigned?: boolean } = {}): string | null {
  if (request.magic !== MAGIC || request.kind !== 'request') return 'Not a capture request.'
  if (!isRequestId(request.requestId)) return 'Request id is missing.'
  if (!request.location.trim() || !request.brief.trim()) return 'Place or brief is missing.'
  if (request.deskFeeBps !== DESK_FEE_BPS) return 'Desk fee must be 10%.'
  try {
    payoutLines(request.rewardSats, request.processingFeeSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Reward is invalid.'
  }
  if (request.requesterIdentity && !isIdentityKey(request.requesterIdentity)) return 'Requester key is invalid.'
  if (!isNonce(request.nonce)) return 'Nonce is missing.'
  if (request.requesterIdentity && !requestIdMatches(request)) return 'Request id does not match the requester key.'
  if (!isIsoDateTime(request.postedAt) || !isIsoDateTime(request.deadline)) return 'Time is missing.'
  if (request.deadline <= request.postedAt) return 'The deadline has to be after the request is posted.'
  if (!options.allowUnsigned && !request.signature) return 'Request signature is missing.'
  if (request.signature && !/^[0-9a-fA-F]+$/.test(request.signature)) return 'Request signature is invalid.'
  return null
}

export function validateSubmit(submit: CaptureSubmit, options: { allowUnsigned?: boolean } = {}): string | null {
  if (submit.magic !== MAGIC || submit.kind !== 'submit') return 'Not a capture submission.'
  if (!isRequestId(submit.requestId)) return 'Request id is missing.'
  if (!isIdentityKey(submit.contributorIdentity)) return 'Contributor key is missing.'
  if (!isReceiptHash(submit.receiptHash)) return 'Receipt hash is missing.'
  if (!isGeohash(submit.geohash)) return 'Coarse location is a 5-character geohash.'
  if (!isIsoDateTime(submit.capturedAt) || !isIsoDateTime(submit.submittedAt)) return 'Time is missing.'
  if (!options.allowUnsigned && !submit.signature) return 'Submission signature is missing.'
  if (submit.signature && !/^[0-9a-fA-F]+$/.test(submit.signature)) return 'Submission signature is invalid.'
  return null
}

export function validateAccept(
  accept: CaptureAccept,
  request?: CaptureRequest,
  options: { allowUnsigned?: boolean } = {}
): string | null {
  if (accept.magic !== MAGIC || accept.kind !== 'accept') return 'Not an acceptance.'
  if (!isRequestId(accept.requestId)) return 'Request id is missing.'
  if (!isReceiptHash(accept.receiptHash)) return 'Receipt hash is missing.'
  if (!isIdentityKey(accept.contributorIdentity)) return 'Contributor key is missing.'
  if (!isIsoDateTime(accept.acceptedAt)) return 'Accepted time is missing.'
  if (request) {
    try {
      const lines = payoutLines(request.rewardSats, request.processingFeeSats)
      if (
        lines.contributorSats !== accept.contributorSats
        || lines.deskFeeSats !== accept.deskFeeSats
        || lines.processingFeeSats !== accept.processingFeeSats
      ) return 'Payout lines do not add up.'
    } catch (error) {
      return error instanceof Error ? error.message : 'Payout is invalid.'
    }
  }
  if (!options.allowUnsigned && !accept.signature) return 'Accept signature is missing.'
  if (accept.signature && !/^[0-9a-fA-F]+$/.test(accept.signature)) return 'Accept signature is invalid.'
  return null
}

export function validateRefund(
  refund: CaptureRefund,
  request?: CaptureRequest,
  options: { allowUnsigned?: boolean } = {}
): string | null {
  if (refund.magic !== MAGIC || refund.kind !== 'refund') return 'Not a refund.'
  if (!isRequestId(refund.requestId)) return 'Request id is missing.'
  if (!isIsoDateTime(refund.refundedAt)) return 'Refund time is missing.'
  try {
    assertSats(refund.refundSats, 'the refund', 1)
  } catch (error) {
    return error instanceof Error ? error.message : 'Refund is invalid.'
  }
  if (request && refund.refundSats !== request.rewardSats) return 'A refund returns the full reward.'
  if (!options.allowUnsigned && !refund.signature) return 'Refund signature is missing.'
  if (refund.signature && !/^[0-9a-fA-F]+$/.test(refund.signature)) return 'Refund signature is invalid.'
  return null
}

export function encodeRequestFields(request: CaptureRequest): number[][] {
  const invalid = validateRequest(request, { allowUnsigned: true })
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('request', request.requestId),
    stringToUtf8Bytes(request.location),
    stringToUtf8Bytes(request.brief),
    stringToUtf8Bytes(String(request.rewardSats)),
    stringToUtf8Bytes(String(request.processingFeeSats)),
    stringToUtf8Bytes(String(request.deskFeeBps)),
    stringToUtf8Bytes(request.deadline),
    stringToUtf8Bytes(request.requesterIdentity || 'pending'),
    stringToUtf8Bytes(request.nonce),
    stringToUtf8Bytes(request.postedAt),
    stringToUtf8Bytes(request.signature || 'unsigned')
  ]
}

export function encodeSubmitFields(submit: CaptureSubmit): number[][] {
  const invalid = validateSubmit(submit, { allowUnsigned: true })
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('submit', submit.requestId),
    stringToUtf8Bytes(submit.contributorIdentity),
    stringToUtf8Bytes(submit.receiptHash),
    stringToUtf8Bytes(submit.capturedAt),
    stringToUtf8Bytes(submit.geohash),
    stringToUtf8Bytes(submit.submittedAt),
    stringToUtf8Bytes(submit.signature || 'unsigned')
  ]
}

export function encodeAcceptFields(accept: CaptureAccept): number[][] {
  const invalid = validateAccept(accept, undefined, { allowUnsigned: true })
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('accept', accept.requestId),
    stringToUtf8Bytes(accept.receiptHash),
    stringToUtf8Bytes(accept.contributorIdentity),
    stringToUtf8Bytes(String(accept.contributorSats)),
    stringToUtf8Bytes(String(accept.deskFeeSats)),
    stringToUtf8Bytes(String(accept.processingFeeSats)),
    stringToUtf8Bytes(accept.acceptedAt),
    stringToUtf8Bytes(accept.signature || 'unsigned')
  ]
}

export function encodeRefundFields(refund: CaptureRefund): number[][] {
  const invalid = validateRefund(refund, undefined, { allowUnsigned: true })
  if (invalid) throw new Error(invalid)
  return [
    ...encodeHead('refund', refund.requestId),
    stringToUtf8Bytes(String(refund.refundSats)),
    stringToUtf8Bytes(refund.refundedAt),
    stringToUtf8Bytes(refund.signature || 'unsigned')
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

function sigField(value: string | undefined): string {
  return !value || value === 'unsigned' ? '' : value
}

export function parseCaptureFields(fields: Array<number[] | Uint8Array>): CapturePayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3 || rest[0] !== SCHEMA_VERSION) return null
  const kind = rest[1]
  const requestId = (rest[2] ?? '').toLowerCase()
  if (kind === 'request') {
    if (rest.length < 13) return null
    const rewardSats = whole(rest[5] ?? '')
    const processingFeeSats = whole(rest[6] ?? '')
    const deskFeeBps = whole(rest[7] ?? '')
    if (rewardSats == null || processingFeeSats == null || deskFeeBps == null) return null
    const identity = (rest[9] ?? '') === 'pending' ? '' : (rest[9] ?? '').toLowerCase()
    const request: CaptureRequest = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'request',
      requestId,
      location: rest[3] ?? '',
      brief: rest[4] ?? '',
      rewardSats,
      processingFeeSats,
      deskFeeBps,
      deadline: rest[8] ?? '',
      requesterIdentity: identity,
      nonce: (rest[10] ?? '').toLowerCase(),
      postedAt: rest[11] ?? '',
      signature: sigField(rest[12])
    }
    return validateRequest(request, { allowUnsigned: true }) ? null : request
  }
  if (kind === 'submit') {
    if (rest.length < 9) return null
    const submit: CaptureSubmit = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'submit',
      requestId,
      contributorIdentity: (rest[3] ?? '').toLowerCase(),
      receiptHash: (rest[4] ?? '').toLowerCase(),
      capturedAt: rest[5] ?? '',
      geohash: (rest[6] ?? '').toLowerCase(),
      submittedAt: rest[7] ?? '',
      signature: sigField(rest[8])
    }
    return validateSubmit(submit, { allowUnsigned: true }) ? null : submit
  }
  if (kind === 'accept') {
    if (rest.length < 10) return null
    const contributorSats = whole(rest[5] ?? '')
    const fee = whole(rest[6] ?? '')
    const processingFeeSats = whole(rest[7] ?? '')
    if (contributorSats == null || fee == null || processingFeeSats == null) return null
    const accept: CaptureAccept = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'accept',
      requestId,
      receiptHash: (rest[3] ?? '').toLowerCase(),
      contributorIdentity: (rest[4] ?? '').toLowerCase(),
      contributorSats,
      deskFeeSats: fee,
      processingFeeSats,
      acceptedAt: rest[8] ?? '',
      signature: sigField(rest[9])
    }
    return validateAccept(accept, undefined, { allowUnsigned: true }) ? null : accept
  }
  if (kind === 'refund') {
    if (rest.length < 6) return null
    const refundSats = whole(rest[3] ?? '')
    if (refundSats == null) return null
    const refund: CaptureRefund = {
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'refund',
      requestId,
      refundSats,
      refundedAt: rest[4] ?? '',
      signature: sigField(rest[5])
    }
    return validateRefund(refund, undefined, { allowUnsigned: true }) ? null : refund
  }
  return null
}

function byIndex<T>(rows: T[]): Array<{ row: T, index: number }> {
  return rows.map((row, index) => ({ row, index }))
}

function oldestRequest(funds: CaptureRequest[]): CaptureRequest | null {
  const ranked = byIndex(funds)
  ranked.sort((left, right) => {
    if (left.row.requesterIdentity !== right.row.requesterIdentity) return left.index - right.index
    if (left.row.postedAt < right.row.postedAt) return -1
    if (left.row.postedAt > right.row.postedAt) return 1
    return left.index - right.index
  })
  return ranked[0]?.row ?? null
}

/** P2PKH of a derived public key. Readers match accept outputs against this script. */
export function p2pkhLockingScript(publicKey: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKey).toHash()).toHex()
}

/**
 * Block height, merkle root, and leaf index from a BEEF merkle proof.
 * The header time is applied later, and only when that root matches.
 */
export function proofInclusion(txid: string, proof: MerklePath): { blockHeight: number, merkleRoot: string, blockIndex: number } | null {
  try {
    const merkleRoot = proof.computeRoot(txid).trim().toLowerCase()
    const blockIndex = proof.indexOf(txid)
    if (!merkleRoot || !Number.isInteger(proof.blockHeight) || proof.blockHeight < 0) return null
    if (!Number.isInteger(blockIndex) || blockIndex < 0) return null
    return { blockHeight: proof.blockHeight, merkleRoot, blockIndex }
  } catch {
    return null
  }
}

/** Header time for a proof. Signer fields, nLockTime, and host-asserted times are not read. */
export function trustedAt(record: ChainRecord, headers: BlockHeaderTime[] = []): string | null {
  if (record.blockHeight == null || !record.merkleRoot) return null
  const root = record.merkleRoot.trim().toLowerCase()
  const header = headers.find((row) => row.height === record.blockHeight && row.merkleRoot.trim().toLowerCase() === root)
  if (!header || !Number.isFinite(header.time)) return null
  const ms = header.time > 1e12 ? header.time : header.time * 1000
  const when = new Date(ms)
  if (Number.isNaN(when.getTime())) return null
  return when.toISOString()
}

function trustedPosition(record: ChainRecord, headers: BlockHeaderTime[]): { height: number, index: number } | null {
  if (!trustedAt(record, headers)) return null
  return { height: record.blockHeight ?? 0, index: record.blockIndex ?? 0 }
}

function submissionMatches(accept: CaptureAccept, submissions: CaptureSubmit[]): CaptureSubmit | null {
  return submissions.find((row) =>
    row.receiptHash === accept.receiptHash && sameKey(row.contributorIdentity, accept.contributorIdentity)
  ) ?? null
}

function withHostTime(row: CaptureSubmit, record: ChainRecord): CaptureSubmit {
  if (!record.hostAssertedAt) return row
  return { ...row, hostAssertedAt: record.hostAssertedAt }
}

function compareChainRecords(left: ChainRecord, right: ChainRecord, headers: BlockHeaderTime[]): number {
  const a = trustedPosition(left, headers)
  const b = trustedPosition(right, headers)
  if (a && b) {
    if (a.height !== b.height) return a.height - b.height
    if (a.index !== b.index) return a.index - b.index
    if (left.payload.kind === 'submit' && right.payload.kind === 'submit') {
      const leftRow = left.payload
      const rightRow = right.payload
      if (sameKey(leftRow.contributorIdentity, rightRow.contributorIdentity) && leftRow.capturedAt !== rightRow.capturedAt) {
        return leftRow.capturedAt < rightRow.capturedAt ? -1 : 1
      }
    }
  } else if (a && !b) {
    return -1
  } else if (!a && b) {
    return 1
  }
  const tx = left.txid.trim().toLowerCase().localeCompare(right.txid.trim().toLowerCase())
  if (tx !== 0) return tx
  return left.vout - right.vout
}

interface ClassifiedSubmissions {
  onTime: CaptureSubmit[]
  pending: CaptureSubmit[]
  late: CaptureSubmit[]
}

function classifySubmissions(records: ChainRecord[], request: CaptureRequest, headers: BlockHeaderTime[]): ClassifiedSubmissions {
  const signed = records.filter((record) => {
    const row = record.payload
    return row.kind === 'submit'
      && row.requestId === request.requestId
      && signedByContributor(row.contributorIdentity, submitMessage(row), row.signature)
  })
  const ranked = [...signed].sort((left, right) => compareChainRecords(left, right, headers))
  const seen = new Set<string>()
  const onTime: CaptureSubmit[] = []
  const pending: CaptureSubmit[] = []
  const late: CaptureSubmit[] = []
  const deadline = Date.parse(request.deadline)
  for (const record of ranked) {
    const row = record.payload
    if (row.kind !== 'submit') continue
    const key = `${row.contributorIdentity}|${row.receiptHash}`
    if (seen.has(key)) continue
    seen.add(key)
    const view = withHostTime(row, record)
    const when = trustedAt(record, headers)
    if (!when) {
      pending.push(view)
      continue
    }
    if (Date.parse(when) <= deadline) onTime.push(view)
    else late.push(view)
  }
  return { onTime, pending, late }
}

/** Readers require these three payment outputs. The script does not. */
export function acceptPaysSplit(record: ChainRecord, request: CaptureRequest, submission: CaptureSubmit): boolean {
  if (!record.outputs || record.outputs.length === 0) return false
  let lines: PayoutLines
  try {
    lines = payoutLines(request.rewardSats, request.processingFeeSats)
  } catch {
    return false
  }
  const payments = record.outputs
    .filter((_, index) => index !== record.vout)
    .map((output) => ({
      satoshis: output.satoshis,
      lockingScript: output.lockingScript.trim().toLowerCase()
    }))
  const contributor = p2pkhLockingScript(contributorPayoutKey(submission.contributorIdentity)).toLowerCase()
  const desk = p2pkhLockingScript(deskFeeLockingKey()).toLowerCase()
  const take = (script: string, sats: number) => {
    const index = payments.findIndex((output) => output.lockingScript === script && output.satoshis === sats)
    if (index < 0) return false
    payments.splice(index, 1)
    return true
  }
  return take(contributor, lines.contributorSats)
    && take(desk, lines.deskFeeSats)
    && take(desk, lines.processingFeeSats)
    && payments.length === 0
}

function keptAccept(records: ChainRecord[], request: CaptureRequest, submissions: CaptureSubmit[], headers: BlockHeaderTime[]): CaptureAccept | null {
  const valid = records.filter((record) => {
    const row = record.payload
    if (row.kind !== 'accept' || row.requestId !== request.requestId) return false
    if (!signedByEscrow(request.requesterIdentity, request.requestId, acceptMessage(row), row.signature)) return false
    if (validateAccept(row, request)) return false
    const submission = submissionMatches(row, submissions)
    if (!submission) return false
    return acceptPaysSplit(record, request, submission)
  })
  valid.sort((left, right) => compareChainRecords(left, right, headers))
  const first = valid[0]?.payload
  return first && first.kind === 'accept' ? first : null
}

interface ClassifiedRefund {
  refund: CaptureRefund | null
  pending: CaptureRefund | null
  early: CaptureRefund | null
}

function classifyRefunds(
  records: ChainRecord[],
  request: CaptureRequest,
  accept: CaptureAccept | null,
  headers: BlockHeaderTime[]
): ClassifiedRefund {
  const empty = { refund: null, pending: null, early: null }
  if (accept) return empty
  const valid = records.filter((record) => {
    const row = record.payload
    if (row.kind !== 'refund' || row.requestId !== request.requestId) return false
    if (!signedByEscrow(request.requesterIdentity, request.requestId, refundMessage(row), row.signature)) return false
    return !validateRefund(row, request)
  })
  valid.sort((left, right) => compareChainRecords(left, right, headers))
  const deadline = Date.parse(request.deadline)
  let pending: CaptureRefund | null = null
  let early: CaptureRefund | null = null
  for (const record of valid) {
    const row = record.payload
    if (row.kind !== 'refund') continue
    const when = trustedAt(record, headers)
    if (!when) {
      pending ??= row
      continue
    }
    if (Date.parse(when) > deadline) return { refund: row, pending: null, early: null }
    early ??= row
  }
  return { refund: null, pending, early }
}

function payloadRecords(rows: CapturePayload[]): ChainRecord[] {
  return rows.map((payload, index) => ({
    txid: index.toString(16).padStart(64, '0'),
    vout: 0,
    inputs: [],
    lockingPublicKey: '',
    payload
  }))
}

export function deskFromRecords(rows: CapturePayload[], requestId?: string): DeskState | null {
  const scoped = keepMagic(rows).filter((row) => !requestId || row.requestId === requestId)
  const request = oldestRequest(scoped.filter((row): row is CaptureRequest =>
    row.kind === 'request' && requestIdMatches(row) && signedByEscrow(row.requesterIdentity, row.requestId, requestMessage(row), row.signature)
  ))
  if (!request) return null
  return foldDesk(request, payloadRecords(scoped), null, [])
}

function outpointOf(record: ChainRecord): string {
  return `${record.txid.trim().toLowerCase()}.${record.vout}`
}

function requestIsValid(record: ChainRecord, requestId?: string, pinIdentity?: string | null): record is ChainRecord & { payload: CaptureRequest } {
  if (record.payload.kind !== 'request') return false
  const request = record.payload
  if (requestId && request.requestId !== requestId) return false
  if (pinIdentity && !sameKey(request.requesterIdentity, pinIdentity)) return false
  if (!requestIdMatches(request)) return false
  if (!record.lockingPublicKey) return false
  if (!requestLockedToRequester(record.lockingPublicKey, request)) return false
  return signedByEscrow(request.requesterIdentity, request.requestId, requestMessage(request), request.signature)
}

/** The request named by hintTxid, otherwise the oldest valid request from that key. A bad hint does not fall through. */
export function canonicalRequestRecord(records: ChainRecord[], options: ReadOptions = {}): ChainRecord | null {
  const hint = options.hintTxid?.trim().toLowerCase() || null
  const pin = options.pinIdentity?.trim() || null
  const funds = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => requestIsValid(record, options.requestId, pin))
  if (hint) return funds.find(({ record }) => record.txid.trim().toLowerCase() === hint)?.record ?? null
  funds.sort((left, right) => {
    const older = left.record.payload as CaptureRequest
    const newer = right.record.payload as CaptureRequest
    if (older.requesterIdentity !== newer.requesterIdentity) return left.index - right.index
    if (older.postedAt < newer.postedAt) return -1
    if (older.postedAt > newer.postedAt) return 1
    return left.index - right.index
  })
  return funds[0]?.record ?? null
}

function spends(record: ChainRecord, outpoint: string): boolean {
  return record.inputs.map((input) => input.trim().toLowerCase()).includes(outpoint)
}

function foldDesk(
  request: CaptureRequest,
  scoped: ChainRecord[],
  fund: ChainRecord | null,
  headers: BlockHeaderTime[],
  spentOutpoints: string[] = []
): DeskState {
  const head = fund ? outpointOf(fund) : null
  const submissions = classifySubmissions(scoped, request, headers)
  const acceptRows = head
    ? scoped.filter((row) => row.payload.kind === 'accept' && spends(row, head))
    : []
  const accept = keptAccept(acceptRows, request, submissions.onTime, headers)
  const refundRows = head
    ? scoped.filter((row) => row.payload.kind === 'refund' && spends(row, head))
    : scoped.filter((row) => row.payload.kind === 'refund')
  const refunds = classifyRefunds(refundRows, request, accept, headers)
  const explained = Boolean(accept || refunds.refund || refunds.pending || refunds.early)
  const spent = Boolean(head) && !explained && (
    spentOutpoints.some((outpoint) => outpoint.trim().toLowerCase() === head)
    || scoped.some((row) => spends(row, head!))
  )
  return {
    ...emptyDesk(),
    request,
    submissions: submissions.onTime,
    pendingSubmissions: submissions.pending,
    lateSubmissions: submissions.late,
    accept,
    refund: refunds.refund,
    pendingRefund: refunds.pending,
    earlyRefund: refunds.early,
    spent
  }
}

export function deskFromChain(records: ChainRecord[], options: ReadOptions = {}): DeskState | null {
  const chosen = canonicalRequestRecord(records, options)
  if (!chosen || chosen.payload.kind !== 'request') return null
  const request = chosen.payload
  const scoped = records.filter((row) => row.payload.requestId === request.requestId)
  return foldDesk(request, scoped, chosen, options.headers ?? [], options.spentOutpoints ?? [])
}

export function statusOf(row: { accept: CaptureAccept | null, refund: CaptureRefund | null, pendingRefund?: CaptureRefund | null, earlyRefund?: CaptureRefund | null, spent?: boolean }): CaptureStatus {
  if (row.accept) return 'accepted'
  if (row.refund) return 'refunded'
  if (row.pendingRefund || row.earlyRefund) return 'pending'
  if (row.spent) return 'spent'
  return 'open'
}

/** Different keys sort by request id. Posted time breaks ties only inside one key. */
export function sortBoard<T extends ListedRequest>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const a = left.request.requesterIdentity
    const b = right.request.requesterIdentity
    if (a !== b) return left.requestId < right.requestId ? -1 : left.requestId > right.requestId ? 1 : 0
    if (left.request.postedAt !== right.request.postedAt) {
      return left.request.postedAt < right.request.postedAt ? -1 : 1
    }
    return left.requestId < right.requestId ? -1 : left.requestId > right.requestId ? 1 : 0
  })
}

function listedFromDesk(requestId: string, desk: DeskState, txid: string, fund: ChainRecord | null, headers: BlockHeaderTime[]): ListedRequest {
  return {
    requestId,
    request: desk.request!,
    submissions: desk.submissions,
    pendingSubmissions: desk.pendingSubmissions,
    lateSubmissions: desk.lateSubmissions,
    accept: desk.accept,
    refund: desk.refund,
    pendingRefund: desk.pendingRefund,
    earlyRefund: desk.earlyRefund,
    txid,
    status: statusOf(desk),
    trustedPostedAt: fund ? trustedAt(fund, headers) : null,
    trustedAcceptAt: null
  }
}

export function bookFromChain(records: ChainRecord[], pinIdentity?: string | null, headers: BlockHeaderTime[] = [], spentOutpoints: string[] = []): ListedRequest[] {
  const ids: string[] = []
  for (const row of records) {
    if (row.payload.kind !== 'request') continue
    if (!ids.includes(row.payload.requestId)) ids.push(row.payload.requestId)
  }
  const book: ListedRequest[] = []
  for (const requestId of ids) {
    const chosen = canonicalRequestRecord(records, { requestId, pinIdentity, headers, spentOutpoints })
    if (!chosen || chosen.payload.kind !== 'request') continue
    const desk = deskFromChain(records, { requestId, pinIdentity, hintTxid: chosen.txid, headers, spentOutpoints })
    if (!desk?.request) continue
    const head = outpointOf(chosen)
    const acceptRecord = records.find((row) =>
      row.payload.kind === 'accept' && row.payload.requestId === requestId && spends(row, head) && desk.accept && row.payload.signature === desk.accept.signature
    ) ?? null
    book.push({
      ...listedFromDesk(requestId, desk, chosen.txid, chosen, headers),
      trustedAcceptAt: acceptRecord ? trustedAt(acceptRecord, headers) : null
    })
  }
  return sortBoard(book)
}

export function bookFromRecords(rows: CapturePayload[]): ListedRequest[] {
  const ids: string[] = []
  for (const row of keepMagic(rows)) {
    if (row.kind !== 'request') continue
    if (!ids.includes(row.requestId)) ids.push(row.requestId)
  }
  const book: ListedRequest[] = []
  for (const requestId of ids) {
    const desk = deskFromRecords(rows, requestId)
    if (!desk?.request) continue
    book.push(listedFromDesk(requestId, desk, '', null, []))
  }
  return sortBoard(book)
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((left, right) => left - right)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid] ?? null
  const left = sorted[mid - 1]
  const right = sorted[mid]
  if (left == null || right == null) return null
  return Math.round((left + right) / 2)
}

/** Open, accepted, refunded, accept rate, and median time to accept. Header times only. */
export function boardStats(rows: ListedRequest[]): BoardStats {
  let open = 0
  let accepted = 0
  let refunded = 0
  let pending = 0
  let spent = 0
  const durations: number[] = []
  for (const row of rows) {
    if (row.status === 'accepted') {
      accepted += 1
      if (row.trustedAcceptAt && row.trustedPostedAt) {
        const delta = Date.parse(row.trustedAcceptAt) - Date.parse(row.trustedPostedAt)
        if (Number.isFinite(delta)) durations.push(delta)
      }
    } else if (row.status === 'refunded') {
      refunded += 1
    } else if (row.status === 'pending') {
      pending += 1
    } else if (row.status === 'spent') {
      spent += 1
    } else {
      open += 1
    }
  }
  const total = open + accepted + refunded + pending + spent
  return {
    open,
    accepted,
    refunded,
    pending,
    spent,
    acceptRate: total === 0 ? null : Math.round((accepted / total) * 100),
    medianAcceptMs: median(durations)
  }
}

export function feeOutputInstructions(): string {
  return JSON.stringify({
    protocolID: BRC29_PROTOCOL,
    keyID: DESK_FEE_KEY_ID,
    counterparty: 'anyone',
    identityKey: DESK_FEE_KEY
  })
}
