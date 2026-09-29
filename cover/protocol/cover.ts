import { BigNumber, ECDSA, Hash, PublicKey, Signature } from '@bsv/sdk'
import { sha256Bytes, sha256Hex } from './sha256'

/**
 * Cover desk protocol (PushDrop / BRC-48 fields).
 *
 * Buy cover against one operational risk. The policy is an overlay record.
 * A claim carries an evidence hash. Named approvers each sign an approval.
 * When quorum is met, a release record names the payout and is signed too.
 * MAGIC `cover`.
 * Public Pages uses tm_anytx / ls_anytx. Client filters on MAGIC.
 *
 * v0 pays the premium (split into a labeled premium cut and the rest) and
 * a labeled claim-admin fee. It does not lock a capital pool and does not
 * pay the insured amount. That payout figure is attested on the release.
 *
 * Not Vouch (trust bond). Not Credit (a loan against an invoice).
 * Not Grants (a gift). Not Job Escrow (locked labor funds).
 * Not Vault Claim (burn a vaulted item).
 */

export const PROTOCOL_ID: [0, string] = [0, 'cover']
/** BRC-42 key id for createSignature / getPublicKey. counterparty is `self`. */
export const SIGNING_KEY_ID = 'cover'
export const BASKET = 'cover'
export const MAGIC = 'cover'
export const SCHEMA_VERSION = '1'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MESSAGE_BOX = 'cover'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const SUBJECT_MAX = 80
export const INSURED_MIN = 10_000
export const INSURED_MAX = 1_000_000_000
export const TERM_DAYS_MIN = 1
export const TERM_DAYS_MAX = 365
export const PREMIUM_MIN = 100
/** Desk fee, in basis points of the premium. 1000 = 10%. */
export const PREMIUM_CUT_BPS = 1_000
export const PREMIUM_CUT_MIN = 1
export const CLAIM_ADMIN_FEE_SATS = 500
export const ATTEST_SATS = 1
export const APPROVER_COUNT = 3
export const DEFAULT_QUORUM = 2
export const EVIDENCE_FILE_MAX = 2_000_000

export const COVER_KINDS = ['contract', 'event', 'contractor'] as const
export type CoverKind = (typeof COVER_KINDS)[number]

/** Basis points of the insured amount, pro-rated over 30 days. */
export const KIND_RATE_BPS: Record<CoverKind, number> = {
  contract: 200,
  event: 300,
  contractor: 250
}

export const KIND_LABEL: Record<CoverKind, string> = {
  contract: 'Contract failure',
  event: 'Event cancellation',
  contractor: 'Contractor default'
}

export const KINDS = ['policy', 'claim', 'approval', 'release'] as const
export type CoverRecordKind = (typeof KINDS)[number]

export const DEFAULT_SUBJECT = 'Spring fair'
export const DEFAULT_COVER_KIND: CoverKind = 'event'
export const DEFAULT_INSURED_SATS = 100_000
export const DEFAULT_TERM_DAYS = 30

export interface CoverQuote {
  premiumSats: number
  premiumCutSats: number
  netPremiumSats: number
}

export interface PolicyRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'policy'
  policyId: string
  coverKind: CoverKind
  subject: string
  holder: string
  desk: string
  insuredSats: number
  termDays: number
  premiumSats: number
  premiumCutSats: number
  quorum: number
  approver1: string
  approver2: string
  approver3: string
  boughtAt: string
  endsAt: string
}

export interface ClaimRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'claim'
  policyId: string
  claimId: string
  holder: string
  evidenceHash: string
  payoutSats: number
  filedAt: string
  signature: string
}

export interface ApprovalRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'approval'
  policyId: string
  claimId: string
  signer: string
  approvedAt: string
  signature: string
}

export interface ReleaseRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'release'
  policyId: string
  claimId: string
  payoutSats: number
  claimAdminFeeSats: number
  releaser: string
  releasedAt: string
  signature: string
}

export type CoverPayload = PolicyRecord | ClaimRecord | ApprovalRecord | ReleaseRecord

export type ClaimStatus = 'filed' | 'released'

export interface FoldedClaim {
  claim: ClaimRecord
  approvals: ApprovalRecord[]
  release: ReleaseRecord | null
  approvalCount: number
  quorumMet: boolean
  status: ClaimStatus
}

export interface CoverReadingClaim {
  claimId: string
  evidenceHash: string
  payoutSats: number
  approvalCount: number
  quorumMet: boolean
  status: ClaimStatus
  claimAdminFeeSats: number | null
  releasedAt: string | null
}

export interface CoverReading {
  kind: 'cover-reading'
  policyId: string
  coverKind: CoverKind
  subject: string
  holder: string
  desk: string
  insuredSats: number
  termDays: number
  premiumSats: number
  premiumCutSats: number
  quorum: number
  boughtAt: string
  endsAt: string
  claims: CoverReadingClaim[]
  exportedAt: string
}

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const POLICY_ID = /^[0-9a-f]{32}$/
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

export function isPolicyId(value: string): boolean {
  return POLICY_ID.test(value.trim().toLowerCase())
}

export function isRecordId(value: string): boolean {
  return RECORD_ID.test(value.trim().toLowerCase())
}

export function isEvidenceHash(value: string): boolean {
  return RECORD_ID.test(value.trim().toLowerCase())
}

export function isCoverKind(value: string): value is CoverKind {
  return (COVER_KINDS as readonly string[]).includes(value)
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  return !Number.isNaN(new Date(trimmed).getTime())
}

export function policyBindingId(record: {
  coverKind: string
  subject: string
  holder: string
  desk: string
  insuredSats: number
  termDays: number
  premiumSats: number
  premiumCutSats: number
  quorum: number
  approver1: string
  approver2: string
  approver3: string
  boughtAt: string
  endsAt: string
}): string {
  const body = JSON.stringify({
    v: 1,
    coverKind: record.coverKind,
    subject: record.subject.trim(),
    holder: record.holder.trim().toLowerCase(),
    desk: record.desk.trim().toLowerCase(),
    insuredSats: record.insuredSats,
    termDays: record.termDays,
    premiumSats: record.premiumSats,
    premiumCutSats: record.premiumCutSats,
    quorum: record.quorum,
    approver1: record.approver1.trim().toLowerCase(),
    approver2: record.approver2.trim().toLowerCase(),
    approver3: record.approver3.trim().toLowerCase(),
    boughtAt: record.boughtAt,
    endsAt: record.endsAt
  })
  return sha256Hex(body).slice(0, 32)
}

export function bytesToHex(bytes: number[]): string {
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function hexToBytes(value: string): number[] | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().toLowerCase()
  if (!/^[0-9a-f]+$/.test(trimmed) || trimmed.length < 16 || trimmed.length % 2 !== 0) return null
  const out: number[] = []
  for (let index = 0; index < trimmed.length; index += 2) {
    out.push(Number.parseInt(trimmed.slice(index, index + 2), 16))
  }
  return out
}

/** BRC-100 createSignature({ data }) hashes once with SHA-256 before ECDSA. */
export function verifyWalletDataSignature(
  derivedPubkey: string,
  data: number[],
  derSignature: number[]
): boolean {
  try {
    const hash = Hash.sha256(data)
    const key = PublicKey.fromString(derivedPubkey)
    const signature = Signature.fromDER(derSignature)
    return ECDSA.verify(new BigNumber(hash), signature, key)
  } catch {
    return false
  }
}

export function nowIso(from = new Date()): string {
  return from.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function endsAtFrom(boughtAt: string, termDays: number): string {
  const date = new Date(boughtAt)
  date.setTime(date.getTime() + termDays * 24 * 60 * 60 * 1000)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function kindLabel(kind: CoverKind): string {
  return KIND_LABEL[kind]
}

export function assertSubject(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Say what this cover is for.')
  if (trimmed.length > SUBJECT_MAX) {
    throw new Error(`Subject must be at most ${SUBJECT_MAX} characters.`)
  }
  if (/[\r\n]/.test(trimmed)) throw new Error('Subject must be one line.')
  return trimmed
}

export function parseInsured(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < INSURED_MIN || value > INSURED_MAX) return null
    return value
  }
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < INSURED_MIN || parsed > INSURED_MAX) return null
  return parsed
}

export function parseTermDays(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < TERM_DAYS_MIN || value > TERM_DAYS_MAX) return null
    return value
  }
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < TERM_DAYS_MIN || parsed > TERM_DAYS_MAX) return null
  return parsed
}

export function parseQuorum(value: string | number): number | null {
  const parsed = typeof value === 'number' ? value : Number(value.trim())
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > APPROVER_COUNT) return null
  return parsed
}

export function canonicalClaimBytes(
  record: Pick<ClaimRecord, 'policyId' | 'claimId' | 'holder' | 'evidenceHash' | 'payoutSats' | 'filedAt'>
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'claim',
    policyId: record.policyId.trim().toLowerCase(),
    claimId: record.claimId.trim().toLowerCase(),
    holder: record.holder.trim().toLowerCase(),
    evidenceHash: record.evidenceHash.trim().toLowerCase(),
    payoutSats: record.payoutSats,
    filedAt: record.filedAt
  }))
}

export function canonicalApprovalBytes(
  record: Pick<ApprovalRecord, 'policyId' | 'claimId' | 'signer' | 'approvedAt'>
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'approval',
    policyId: record.policyId.trim().toLowerCase(),
    claimId: record.claimId.trim().toLowerCase(),
    signer: record.signer.trim().toLowerCase(),
    approvedAt: record.approvedAt
  }))
}

export function canonicalReleaseBytes(
  record: Pick<ReleaseRecord, 'policyId' | 'claimId' | 'payoutSats' | 'claimAdminFeeSats' | 'releaser' | 'releasedAt'>
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'release',
    policyId: record.policyId.trim().toLowerCase(),
    claimId: record.claimId.trim().toLowerCase(),
    payoutSats: record.payoutSats,
    claimAdminFeeSats: record.claimAdminFeeSats,
    releaser: record.releaser.trim().toLowerCase(),
    releasedAt: record.releasedAt
  }))
}

export function claimSignatureOk(record: ClaimRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.holder.trim(), canonicalClaimBytes(record), der)
}

export function approvalSignatureOk(record: ApprovalRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.signer.trim(), canonicalApprovalBytes(record), der)
}

export function releaseSignatureOk(record: ReleaseRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.releaser.trim(), canonicalReleaseBytes(record), der)
}

export function quoteCover(kind: CoverKind, insuredSats: number, termDays: number): CoverQuote {
  const rate = KIND_RATE_BPS[kind]
  const raw = Math.round((insuredSats * rate * termDays) / (30 * 10_000))
  const premiumSats = Math.max(PREMIUM_MIN, raw)
  let premiumCutSats = Math.round((premiumSats * PREMIUM_CUT_BPS) / 10_000)
  if (premiumCutSats < PREMIUM_CUT_MIN) premiumCutSats = PREMIUM_CUT_MIN
  if (premiumCutSats >= premiumSats) premiumCutSats = premiumSats - 1
  return {
    premiumSats,
    premiumCutSats,
    netPremiumSats: premiumSats - premiumCutSats
  }
}

export function approverKeys(policy: Pick<PolicyRecord, 'approver1' | 'approver2' | 'approver3'>): string[] {
  return [policy.approver1, policy.approver2, policy.approver3]
}

export function isHolder(policy: Pick<PolicyRecord, 'holder'>, identityKey: string): boolean {
  return sameIdentity(policy.holder, identityKey)
}

export function isApprover(
  policy: Pick<PolicyRecord, 'approver1' | 'approver2' | 'approver3'>,
  identityKey: string
): boolean {
  return approverKeys(policy).some((key) => sameIdentity(key, identityKey))
}

/** Trim the note, then sha256 it. Leading and trailing whitespace is not part of the mark. */
export function hashEvidenceText(text: string): string {
  const trimmed = text.trim()
  if (!trimmed) throw new Error('Paste what happened, or pick a file. Nothing is uploaded.')
  return sha256Hex(trimmed)
}

export function hashEvidenceFile(bytes: Uint8Array): string {
  if (bytes.byteLength < 1) throw new Error('That file is empty.')
  if (bytes.byteLength > EVIDENCE_FILE_MAX) throw new Error('That file is too large to hash here.')
  return sha256Bytes(bytes)
}

export function makeClaimId(
  policyId: string,
  holder: string,
  evidenceHash: string,
  filedAt: string,
  nonce: string
): string {
  return sha256Hex(['claim', policyId, holder, evidenceHash, filedAt, nonce].join('\n'))
}

export function formatSats(sats: number): string {
  const n = Math.trunc(sats)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n.toLocaleString('en-US')} sats`
}

export function validatePolicy(record: PolicyRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a cover record.'
  if (record.kind !== 'policy') return 'Not a policy record.'
  if (!isPolicyId(record.policyId)) return 'Policy id is missing.'
  if (!isCoverKind(record.coverKind)) return 'Pick a cover kind.'
  try {
    assertSubject(record.subject)
  } catch (error) {
    return error instanceof Error ? error.message : 'Subject is invalid.'
  }
  if (!isIdentityKey(record.holder)) return 'Holder identity is missing.'
  if (!isIdentityKey(record.desk)) return 'Desk identity is missing.'
  if (parseInsured(record.insuredSats) !== record.insuredSats) {
    return 'Insured amount must be a whole number of sats.'
  }
  if (parseTermDays(record.termDays) !== record.termDays) return 'Term must be a whole number of days.'
  const quote = quoteCover(record.coverKind, record.insuredSats, record.termDays)
  if (record.premiumSats !== quote.premiumSats) return 'Premium does not match the quote.'
  if (record.premiumCutSats !== quote.premiumCutSats) return 'Premium cut does not match the quote.'
  if (parseQuorum(record.quorum) !== record.quorum) return 'Approvals needed must be 2 or 3.'
  for (const key of approverKeys(record)) {
    if (!isIdentityKey(key)) return 'Approver identity is missing.'
  }
  const lowered = approverKeys(record).map((key) => key.toLowerCase())
  if (new Set(lowered).size !== APPROVER_COUNT) return 'Name three different approvers.'
  if (lowered.includes(record.holder.trim().toLowerCase())) return 'The holder can’t be an approver.'
  if (record.policyId.trim().toLowerCase() !== policyBindingId(record)) {
    return 'Policy id does not match this policy.'
  }
  if (!isIsoDateTime(record.boughtAt)) return 'Bought time is missing.'
  if (!isIsoDateTime(record.endsAt)) return 'Term end is missing.'
  if (record.endsAt !== endsAtFrom(record.boughtAt, record.termDays)) {
    return 'Term end does not match the term.'
  }
  return null
}

export function validateClaim(record: ClaimRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a cover record.'
  if (record.kind !== 'claim') return 'Not a claim record.'
  if (!isPolicyId(record.policyId)) return 'Policy id is missing.'
  if (!isRecordId(record.claimId)) return 'Claim id is missing.'
  if (!isIdentityKey(record.holder)) return 'Holder identity is missing.'
  if (!isEvidenceHash(record.evidenceHash)) return 'Evidence hash is missing.'
  if (!Number.isInteger(record.payoutSats) || record.payoutSats < 1) {
    return 'Payout must be a whole number of sats.'
  }
  if (!isIsoDateTime(record.filedAt)) return 'Filed time is missing.'
  if (!claimSignatureOk(record)) return 'This claim is not signed by the holder.'
  return null
}

export function validateApproval(record: ApprovalRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a cover record.'
  if (record.kind !== 'approval') return 'Not an approval record.'
  if (!isPolicyId(record.policyId)) return 'Policy id is missing.'
  if (!isRecordId(record.claimId)) return 'Claim id is missing.'
  if (!isIdentityKey(record.signer)) return 'Approver identity is missing.'
  if (!isIsoDateTime(record.approvedAt)) return 'Approved time is missing.'
  if (!approvalSignatureOk(record)) return 'This approval is not signed by that approver.'
  return null
}

export function validateRelease(record: ReleaseRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a cover record.'
  if (record.kind !== 'release') return 'Not a release record.'
  if (!isPolicyId(record.policyId)) return 'Policy id is missing.'
  if (!isRecordId(record.claimId)) return 'Claim id is missing.'
  if (!Number.isInteger(record.payoutSats) || record.payoutSats < 1) {
    return 'Payout must be a whole number of sats.'
  }
  if (record.claimAdminFeeSats !== CLAIM_ADMIN_FEE_SATS) return 'Claim-admin fee does not match.'
  if (!isIdentityKey(record.releaser)) return 'Releaser identity is missing.'
  if (!isIsoDateTime(record.releasedAt)) return 'Released time is missing.'
  if (!releaseSignatureOk(record)) return 'This release is not signed by that releaser.'
  return null
}

function textFields(parts: string[]): number[][] {
  return parts.map((part) => stringToUtf8Bytes(part))
}

export function encodePolicyFields(
  record: Omit<PolicyRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: PolicyRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'policy', ...record }
  const invalid = validatePolicy(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'policy',
    record.policyId,
    record.coverKind,
    record.subject.trim(),
    record.holder,
    record.desk,
    String(record.insuredSats),
    String(record.termDays),
    String(record.premiumSats),
    String(record.premiumCutSats),
    String(record.quorum),
    record.approver1,
    record.approver2,
    record.approver3,
    record.boughtAt,
    record.endsAt
  ])
}

export function encodeClaimFields(
  record: Omit<ClaimRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: ClaimRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'claim', ...record }
  const invalid = validateClaim(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'claim',
    record.policyId,
    record.claimId,
    record.holder,
    record.evidenceHash.toLowerCase(),
    String(record.payoutSats),
    record.filedAt,
    record.signature.trim().toLowerCase()
  ])
}

export function encodeApprovalFields(
  record: Omit<ApprovalRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: ApprovalRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'approval', ...record }
  const invalid = validateApproval(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'approval',
    record.policyId,
    record.claimId,
    record.signer,
    record.approvedAt,
    record.signature.trim().toLowerCase()
  ])
}

export function encodeReleaseFields(
  record: Omit<ReleaseRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: ReleaseRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'release', ...record }
  const invalid = validateRelease(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'release',
    record.policyId,
    record.claimId,
    String(record.payoutSats),
    String(record.claimAdminFeeSats),
    record.releaser,
    record.releasedAt,
    record.signature.trim().toLowerCase()
  ])
}

function policyFromParts(parts: Omit<PolicyRecord, 'magic' | 'version' | 'kind'>): PolicyRecord | null {
  if (!isCoverKind(parts.coverKind)) return null
  const record: PolicyRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'policy', ...parts }
  return validatePolicy(record) ? null : record
}

function claimFromParts(parts: Omit<ClaimRecord, 'magic' | 'version' | 'kind'>): ClaimRecord | null {
  const record: ClaimRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'claim', ...parts }
  return validateClaim(record) ? null : record
}

function approvalFromParts(parts: Omit<ApprovalRecord, 'magic' | 'version' | 'kind'>): ApprovalRecord | null {
  const record: ApprovalRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'approval', ...parts }
  return validateApproval(record) ? null : record
}

function releaseFromParts(parts: Omit<ReleaseRecord, 'magic' | 'version' | 'kind'>): ReleaseRecord | null {
  const record: ReleaseRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'release', ...parts }
  return validateRelease(record) ? null : record
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

function integerAt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed)) return null
  return parsed
}

export function parseCoverFields(fields: Array<number[] | Uint8Array>): CoverPayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  try {
    const rest = fields.slice(start + 1).map((field) => fieldUtf8(field))
    if (rest.length < 3) return null
    if (rest[0] !== SCHEMA_VERSION) return null
    const kind = rest[1]
    if (kind === 'policy') {
      if (rest.length < 17) return null
      const insuredSats = integerAt(rest[7])
      const termDays = integerAt(rest[8])
      const premiumSats = integerAt(rest[9])
      const premiumCutSats = integerAt(rest[10])
      const quorum = integerAt(rest[11])
      if (
        insuredSats === null || termDays === null || premiumSats === null
        || premiumCutSats === null || quorum === null
      ) return null
      return policyFromParts({
        policyId: rest[2].toLowerCase(),
        coverKind: rest[3] as CoverKind,
        subject: rest[4],
        holder: rest[5],
        desk: rest[6],
        insuredSats,
        termDays,
        premiumSats,
        premiumCutSats,
        quorum,
        approver1: rest[12],
        approver2: rest[13],
        approver3: rest[14],
        boughtAt: rest[15],
        endsAt: rest[16]
      })
    }
    if (kind === 'claim') {
      if (rest.length < 9) return null
      const payoutSats = integerAt(rest[6])
      if (payoutSats === null) return null
      return claimFromParts({
        policyId: rest[2].toLowerCase(),
        claimId: rest[3].toLowerCase(),
        holder: rest[4],
        evidenceHash: rest[5].toLowerCase(),
        payoutSats,
        filedAt: rest[7],
        signature: rest[8].toLowerCase()
      })
    }
    if (kind === 'approval') {
      if (rest.length < 7) return null
      return approvalFromParts({
        policyId: rest[2].toLowerCase(),
        claimId: rest[3].toLowerCase(),
        signer: rest[4],
        approvedAt: rest[5],
        signature: rest[6].toLowerCase()
      })
    }
    if (kind === 'release') {
      if (rest.length < 9) return null
      const payoutSats = integerAt(rest[4])
      const claimAdminFeeSats = integerAt(rest[5])
      if (payoutSats === null || claimAdminFeeSats === null) return null
      return releaseFromParts({
        policyId: rest[2].toLowerCase(),
        claimId: rest[3].toLowerCase(),
        payoutSats,
        claimAdminFeeSats,
        releaser: rest[6],
        releasedAt: rest[7],
        signature: rest[8].toLowerCase()
      })
    }
    return null
  } catch {
    return null
  }
}

export function listPolicies<T extends Pick<PolicyRecord, 'policyId' | 'boughtAt'>>(rows: T[]): T[] {
  const byId = new Map<string, T>()
  for (const row of rows) {
    const prev = byId.get(row.policyId)
    if (!prev || row.boughtAt < prev.boughtAt) byId.set(row.policyId, row)
  }
  return [...byId.values()].sort((left, right) => right.boughtAt.localeCompare(left.boughtAt))
}

export function acceptedApprovals(
  policy: PolicyRecord,
  claim: ClaimRecord,
  approvals: ApprovalRecord[]
): ApprovalRecord[] {
  const seen = new Set<string>()
  const unique: ApprovalRecord[] = []
  const rows = approvals
    .filter((row) => row.policyId === policy.policyId && row.claimId === claim.claimId)
    .filter((row) => approvalSignatureOk(row))
    .filter((row) => isApprover(policy, row.signer))
    .sort((left, right) => left.approvedAt.localeCompare(right.approvedAt))
  for (const row of rows) {
    const key = row.signer.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    unique.push(row)
  }
  return unique
}

export function admitRelease(
  policy: PolicyRecord,
  claim: ClaimRecord,
  approvals: ApprovalRecord[],
  release: ReleaseRecord
): ReleaseRecord | null {
  if (validatePolicy(policy) || validateClaim(claim) || validateRelease(release)) return null
  if (release.policyId !== policy.policyId || release.claimId !== claim.claimId) return null
  if (release.payoutSats !== claim.payoutSats) return null
  if (claim.filedAt < policy.boughtAt || claim.filedAt > policy.endsAt) return null
  const prior = acceptedApprovals(policy, claim, approvals)
    .filter((row) => row.approvedAt <= release.releasedAt)
  if (prior.length < policy.quorum) return null
  const releaserOk = prior.some((row) => sameIdentity(row.signer, release.releaser))
  if (!releaserOk) return null
  return release
}

export function foldClaims(
  policy: PolicyRecord,
  claims: ClaimRecord[],
  approvals: ApprovalRecord[],
  releases: ReleaseRecord[]
): FoldedClaim[] {
  if (validatePolicy(policy)) return []
  const rows = claims
    .filter((claim) => claimSignatureOk(claim))
    .filter((claim) => claim.policyId === policy.policyId)
    .filter((claim) => sameIdentity(claim.holder, policy.holder))
    .filter((claim) => claim.payoutSats <= policy.insuredSats)
    .filter((claim) => claim.filedAt >= policy.boughtAt && claim.filedAt <= policy.endsAt)
    .sort((left, right) => left.filedAt.localeCompare(right.filedAt))

  return rows.map((claim) => {
    const accepted = acceptedApprovals(policy, claim, approvals)
    const admitted = releases
      .map((release) => admitRelease(policy, claim, approvals, release))
      .filter((release): release is ReleaseRecord => release !== null)
      .sort((left, right) => left.releasedAt.localeCompare(right.releasedAt))
    const release = admitted[0] ?? null
    return {
      claim,
      approvals: accepted,
      release,
      approvalCount: accepted.length,
      quorumMet: accepted.length >= policy.quorum,
      status: release ? 'released' : 'filed'
    }
  })
}

export function buildReading(
  policy: PolicyRecord,
  folded: FoldedClaim[],
  exportedAt: string
): CoverReading {
  return {
    kind: 'cover-reading',
    policyId: policy.policyId,
    coverKind: policy.coverKind,
    subject: policy.subject,
    holder: policy.holder,
    desk: policy.desk,
    insuredSats: policy.insuredSats,
    termDays: policy.termDays,
    premiumSats: policy.premiumSats,
    premiumCutSats: policy.premiumCutSats,
    quorum: policy.quorum,
    boughtAt: policy.boughtAt,
    endsAt: policy.endsAt,
    claims: folded.map((row) => ({
      claimId: row.claim.claimId,
      evidenceHash: row.claim.evidenceHash,
      payoutSats: row.claim.payoutSats,
      approvalCount: row.approvalCount,
      quorumMet: row.quorumMet,
      status: row.status,
      claimAdminFeeSats: row.release?.claimAdminFeeSats ?? null,
      releasedAt: row.release?.releasedAt ?? null
    })),
    exportedAt
  }
}

export function readingSlug(subject: string): string {
  const slug = subject.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  return slug || 'cover'
}
