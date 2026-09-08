/**
 * Job escrow protocol (PushDrop / BRC-48 fields).
 *
 * Client funds a job. Funds lock until the provider submits a
 * deliverable hash and the client releases — or a simple
 * challenge / refund. MAGIC `jobescrow`. Public Pages uses
 * tm_anytx / ls_anytx. Client filters on MAGIC.
 *
 * TermiX AACP / request-escrow analog. A tiny ~2% protocol fee
 * is product-story context only. This product does not invent GMV.
 *
 * Not StreamPay. Not Session AP.
 */

export const PROTOCOL_ID: [0, string] = [0, 'jobescrow']
export const BASKET = 'jobescrow'
export const MAGIC = 'jobescrow'
export const SCHEMA_VERSION = '1'
export const BRC29_PROTOCOL_ID: [2, string] = [2, '3241645161d8']
export const MESSAGE_BOX = 'jobescrow'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const LABEL_MAX = 80
export const NAME_MAX = 80
export const MIN_AMOUNT_SATS = 1
export const MAX_AMOUNT_SATS = 1_000_000_000_000
export const DEFAULT_LABEL = 'Shop repair'
export const DEFAULT_PROVIDER_NAME = 'Ada'
export const DEFAULT_AMOUNT_SATS = 100_000
/** Product-story only. v0 does not take this fee. */
export const PROTOCOL_FEE_BPS = 200

export const KINDS = ['fund', 'submit', 'release', 'challenge', 'refund'] as const
export type JobKind = (typeof KINDS)[number]

export type JobStatus = 'funded' | 'submitted' | 'challenged' | 'released' | 'refunded'
export type SheetTitle = 'Job' | 'Submit' | 'Release' | 'Refund' | 'Released' | 'Refunded'

export interface JobFund {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'fund'
  jobId: string
  label: string
  providerName: string
  providerIdentity: string
  amountSats: number
  clientIdentity: string
  createdAt: string
}

export interface JobSubmit {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'submit'
  jobId: string
  deliverableHash: string
  providerIdentity: string
  submittedAt: string
}

export interface JobRelease {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'release'
  jobId: string
  clientIdentity: string
  releasedAt: string
}

export interface JobChallenge {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'challenge'
  jobId: string
  clientIdentity: string
  challengedAt: string
}

export interface JobRefund {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'refund'
  jobId: string
  clientIdentity: string
  refundedAt: string
}

export type JobPayload = JobFund | JobSubmit | JobRelease | JobChallenge | JobRefund

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const JOB_ID = /^[0-9a-f]{32}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/
const HASH = /^[0-9a-f]{64}$/

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

export function isJobId(value: string): boolean {
  return JOB_ID.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function newJobId(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function assertAmountSats(amountSats: number): void {
  if (!Number.isInteger(amountSats) || amountSats < MIN_AMOUNT_SATS || amountSats > MAX_AMOUNT_SATS) {
    throw new Error(`Amount must be an integer between ${MIN_AMOUNT_SATS} and ${MAX_AMOUNT_SATS} sats`)
  }
}

export function assertLabel(label: string): void {
  const trimmed = label.trim()
  if (!trimmed) throw new Error('Label is required.')
  if (trimmed.length > LABEL_MAX) {
    throw new Error(`Label must be at most ${LABEL_MAX} characters.`)
  }
}

export function assertProviderName(name: string): void {
  const trimmed = name.trim()
  if (!trimmed) throw new Error('Provider name is required.')
  if (trimmed.length > NAME_MAX) {
    throw new Error(`Provider name must be at most ${NAME_MAX} characters.`)
  }
}

export function normalizeHash(raw: string): string {
  return raw.trim().replace(/^0x/i, '').toLowerCase()
}

export function assertDeliverableHash(raw: string): string {
  const hash = normalizeHash(raw)
  if (!HASH.test(hash)) throw new Error('Paste the deliverable hash.')
  return hash
}

/** Story figure only. v0 does not take this fee from the lock. */
export function protocolFeeSats(amountSats: number): number {
  assertAmountSats(amountSats)
  return Math.floor((amountSats * PROTOCOL_FEE_BPS) / 10_000)
}

export function jobStatus(parts: {
  fund?: unknown
  submit?: unknown
  release?: unknown
  challenge?: unknown
  refund?: unknown
}): JobStatus | null {
  if (!parts.fund) return null
  if (parts.refund) return 'refunded'
  if (parts.release) return 'released'
  if (parts.challenge) return 'challenged'
  if (parts.submit) return 'submitted'
  return 'funded'
}

export function sheetTitle(status: JobStatus | null): SheetTitle {
  switch (status) {
    case 'funded':
      return 'Submit'
    case 'submitted':
      return 'Release'
    case 'challenged':
      return 'Refund'
    case 'released':
      return 'Released'
    case 'refunded':
      return 'Refunded'
    default:
      return 'Job'
  }
}

export function canSubmit(status: JobStatus | null): boolean {
  return status === 'funded'
}

export function canRelease(status: JobStatus | null): boolean {
  return status === 'submitted' || status === 'challenged'
}

export function canChallenge(status: JobStatus | null): boolean {
  return status === 'funded' || status === 'submitted'
}

export function canRefund(status: JobStatus | null): boolean {
  return status === 'funded' || status === 'submitted' || status === 'challenged'
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function isClient(fund: Pick<JobFund, 'clientIdentity'>, identityKey: string): boolean {
  return sameIdentity(fund.clientIdentity, identityKey)
}

export function isProvider(fund: Pick<JobFund, 'providerIdentity'>, identityKey: string): boolean {
  return sameIdentity(fund.providerIdentity, identityKey)
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

export function validateFund(fund: JobFund): string | null {
  if (fund.magic !== MAGIC) return 'Not a job.'
  if (fund.kind !== 'fund') return 'Not a fund record.'
  if (!isJobId(fund.jobId)) return 'Job id is missing.'
  try {
    assertLabel(fund.label)
  } catch (error) {
    return error instanceof Error ? error.message : 'Label is invalid.'
  }
  try {
    assertProviderName(fund.providerName)
  } catch (error) {
    return error instanceof Error ? error.message : 'Provider name is invalid.'
  }
  try {
    assertAmountSats(fund.amountSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Amount is invalid.'
  }
  if (!isIdentityKey(fund.providerIdentity)) return 'Provider identity is missing.'
  if (!isIdentityKey(fund.clientIdentity)) return 'Client identity is missing.'
  if (!isIsoDateTime(fund.createdAt)) return 'Created time is missing.'
  return null
}

export function validateSubmit(submit: JobSubmit): string | null {
  if (submit.magic !== MAGIC) return 'Not a job.'
  if (submit.kind !== 'submit') return 'Not a submit record.'
  if (!isJobId(submit.jobId)) return 'Job id is missing.'
  try {
    assertDeliverableHash(submit.deliverableHash)
  } catch (error) {
    return error instanceof Error ? error.message : 'Deliverable hash is invalid.'
  }
  if (!isIdentityKey(submit.providerIdentity)) return 'Provider identity is missing.'
  if (!isIsoDateTime(submit.submittedAt)) return 'Submitted time is missing.'
  return null
}

export function validateRelease(release: JobRelease): string | null {
  if (release.magic !== MAGIC) return 'Not a job.'
  if (release.kind !== 'release') return 'Not a release record.'
  if (!isJobId(release.jobId)) return 'Job id is missing.'
  if (!isIdentityKey(release.clientIdentity)) return 'Client identity is missing.'
  if (!isIsoDateTime(release.releasedAt)) return 'Released time is missing.'
  return null
}

export function validateChallenge(challenge: JobChallenge): string | null {
  if (challenge.magic !== MAGIC) return 'Not a job.'
  if (challenge.kind !== 'challenge') return 'Not a challenge record.'
  if (!isJobId(challenge.jobId)) return 'Job id is missing.'
  if (!isIdentityKey(challenge.clientIdentity)) return 'Client identity is missing.'
  if (!isIsoDateTime(challenge.challengedAt)) return 'Challenged time is missing.'
  return null
}

export function validateRefund(refund: JobRefund): string | null {
  if (refund.magic !== MAGIC) return 'Not a job.'
  if (refund.kind !== 'refund') return 'Not a refund record.'
  if (!isJobId(refund.jobId)) return 'Job id is missing.'
  if (!isIdentityKey(refund.clientIdentity)) return 'Client identity is missing.'
  if (!isIsoDateTime(refund.refundedAt)) return 'Refunded time is missing.'
  return null
}

export function encodeFundFields(fund: Omit<JobFund, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: JobFund = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'fund', ...fund }
  const invalid = validateFund(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('fund'),
    stringToUtf8Bytes(fund.jobId),
    stringToUtf8Bytes(fund.label.trim()),
    stringToUtf8Bytes(fund.providerName.trim()),
    stringToUtf8Bytes(fund.providerIdentity),
    stringToUtf8Bytes(String(fund.amountSats)),
    stringToUtf8Bytes(fund.clientIdentity),
    stringToUtf8Bytes(fund.createdAt)
  ]
}

export function encodeSubmitFields(submit: Omit<JobSubmit, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: JobSubmit = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'submit', ...submit }
  const invalid = validateSubmit(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('submit'),
    stringToUtf8Bytes(submit.jobId),
    stringToUtf8Bytes(submit.deliverableHash),
    stringToUtf8Bytes(submit.providerIdentity),
    stringToUtf8Bytes(submit.submittedAt)
  ]
}

export function encodeReleaseFields(release: Omit<JobRelease, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: JobRelease = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'release', ...release }
  const invalid = validateRelease(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('release'),
    stringToUtf8Bytes(release.jobId),
    stringToUtf8Bytes(release.clientIdentity),
    stringToUtf8Bytes(release.releasedAt)
  ]
}

export function encodeChallengeFields(challenge: Omit<JobChallenge, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: JobChallenge = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'challenge', ...challenge }
  const invalid = validateChallenge(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('challenge'),
    stringToUtf8Bytes(challenge.jobId),
    stringToUtf8Bytes(challenge.clientIdentity),
    stringToUtf8Bytes(challenge.challengedAt)
  ]
}

export function encodeRefundFields(refund: Omit<JobRefund, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: JobRefund = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'refund', ...refund }
  const invalid = validateRefund(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('refund'),
    stringToUtf8Bytes(refund.jobId),
    stringToUtf8Bytes(refund.clientIdentity),
    stringToUtf8Bytes(refund.refundedAt)
  ]
}

function fundFromParts(parts: Omit<JobFund, 'magic' | 'version' | 'kind'>): JobFund | null {
  const fund: JobFund = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'fund', ...parts }
  return validateFund(fund) ? null : fund
}

function submitFromParts(parts: Omit<JobSubmit, 'magic' | 'version' | 'kind'>): JobSubmit | null {
  const submit: JobSubmit = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'submit', ...parts }
  return validateSubmit(submit) ? null : submit
}

function releaseFromParts(parts: Omit<JobRelease, 'magic' | 'version' | 'kind'>): JobRelease | null {
  const release: JobRelease = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'release', ...parts }
  return validateRelease(release) ? null : release
}

function challengeFromParts(parts: Omit<JobChallenge, 'magic' | 'version' | 'kind'>): JobChallenge | null {
  const challenge: JobChallenge = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'challenge', ...parts }
  return validateChallenge(challenge) ? null : challenge
}

function refundFromParts(parts: Omit<JobRefund, 'magic' | 'version' | 'kind'>): JobRefund | null {
  const refund: JobRefund = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'refund', ...parts }
  return validateRefund(refund) ? null : refund
}

export function parseJobFields(fields: Array<number[] | Uint8Array>): JobPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION) return null
  if (kind === 'fund') {
    if (rest.length < 9) return null
    const amountSats = Number(rest[6])
    if (!Number.isInteger(amountSats)) return null
    return fundFromParts({
      jobId: rest[2],
      label: rest[3],
      providerName: rest[4],
      providerIdentity: rest[5],
      amountSats,
      clientIdentity: rest[7],
      createdAt: rest[8]
    })
  }
  if (kind === 'submit') {
    if (rest.length < 6) return null
    return submitFromParts({
      jobId: rest[2],
      deliverableHash: rest[3],
      providerIdentity: rest[4],
      submittedAt: rest[5]
    })
  }
  if (kind === 'release') {
    if (rest.length < 5) return null
    return releaseFromParts({
      jobId: rest[2],
      clientIdentity: rest[3],
      releasedAt: rest[4]
    })
  }
  if (kind === 'challenge') {
    if (rest.length < 5) return null
    return challengeFromParts({
      jobId: rest[2],
      clientIdentity: rest[3],
      challengedAt: rest[4]
    })
  }
  if (kind === 'refund') {
    if (rest.length < 5) return null
    return refundFromParts({
      jobId: rest[2],
      clientIdentity: rest[3],
      refundedAt: rest[4]
    })
  }
  return null
}

export function shortHash(hash: string, size = 8): string {
  if (hash.length <= size * 2) return hash
  return `${hash.slice(0, size)}…${hash.slice(-6)}`
}
