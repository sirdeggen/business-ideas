import { BigNumber, ECDSA, Hash, PublicKey, Signature } from '@bsv/sdk'
import { sha256Hex } from './sha256'

/**
 * Private Pay desk (PushDrop fields).
 *
 * Confidential business payments with a scoped auditor view.
 * The amount and the line note are sealed to the payee, and again to an
 * auditor only when the payer grants a view. The public overlay carries the
 * payment id, the time, the fee, the counterparty key id, and whether a view
 * was granted.
 *
 * MAGIC `private-pay`. Wallet protocol id is `[0, "privatepay"]` because
 * BRC-42 protocol names allow only letters, numbers, and spaces.
 * Basket and Message Box stay `private-pay`.
 * Public Pages uses tm_anytx / ls_anytx. The client filters on MAGIC.
 *
 * v0 pays a labeled payment fee (basis points of the sealed amount) and a
 * labeled audit-view grant fee. It does not pay the sealed amount as a
 * visible output. That amount stays in ciphertext.
 *
 * Not Spend Policy (rules on what a key can spend).
 * Not Treasury (org money and a multi-sig feed).
 */

export const PROTOCOL_ID: [0, string] = [0, 'privatepay']
/** BRC-42 key id for createSignature / getPublicKey. counterparty is `self`. */
export const SIGNING_KEY_ID = 'privatepay'
export const BASKET = 'private-pay'
export const MAGIC = 'private-pay'
export const SCHEMA_VERSION = '1'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MESSAGE_BOX = 'private-pay'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const LABEL_MAX = 80
export const LINE_MAX = 160
export const AMOUNT_MIN = 1
export const AMOUNT_MAX = 1_000_000_000
/** Small basis points of the sealed amount. 25 = 0.25%. */
export const PAYMENT_FEE_BPS = 25
export const PAYMENT_FEE_MIN = 1
/** Flat sats charged when a view is granted. */
export const AUDIT_VIEW_FEE_SATS = 250
export const ATTEST_SATS = 1
export const GRANT_DAYS_MIN = 1
export const GRANT_DAYS_MAX = 365
export const DEFAULT_GRANT_DAYS = 90
export const VIEW_SCOPE = 'amount'

export const DEFAULT_LABEL = 'October payroll'
export const DEFAULT_LINE = 'October salary'
export const DEFAULT_AMOUNT_SATS = 400_000

export const KINDS = ['payment', 'attest', 'grant', 'revoke'] as const
export type PrivatePayKind = (typeof KINDS)[number]

export interface PaymentRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'payment'
  paymentId: string
  label: string
  payer: string
  payerIdentity: string
  payeeIdentity: string
  payee: string
  desk: string
  counterpartyKeyId: string
  amountCipher: string
  feeSats: number
  paidAt: string
  signature: string
}

export interface AttestRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'attest'
  paymentId: string
  signer: string
  attestedAt: string
  signature: string
}

export interface GrantRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'grant'
  grantId: string
  paymentId: string
  payer: string
  auditor: string
  scope: typeof VIEW_SCOPE
  expiresAt: string
  auditorCipher: string
  feeSats: number
  grantedAt: string
  signature: string
}

export interface RevokeRecord {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'revoke'
  grantId: string
  paymentId: string
  payer: string
  revokedAt: string
  signature: string
}

export type PrivatePayPayload = PaymentRecord | AttestRecord | GrantRecord | RevokeRecord

export interface SealedAmount {
  v: 1
  amountSats: number
  lineNote: string
}

export interface FoldedPayment {
  payment: PaymentRecord
  attestation: AttestRecord | null
  grants: GrantRecord[]
  revokes: RevokeRecord[]
  viewGranted: boolean
  openViews: number
}

export interface PrivatePayReading {
  kind: 'private-pay-reading'
  paymentId: string
  label: string
  counterpartyKeyId: string
  feeSats: number
  paidAt: string
  attested: boolean
  attestedAt: string | null
  viewGranted: boolean
  openViews: number
  amountSats: null
  lineNote: null
  exportedAt: string
}

export type ViewRole = 'payer' | 'payee' | 'auditor'

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const PAYMENT_ID = /^[0-9a-f]{32}$/
const KEY_ID = /^[0-9a-f]{16}$/
const HEX_BLOB = /^[0-9a-f]{32,}$/
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

export function isPaymentId(value: string): boolean {
  return PAYMENT_ID.test(value.trim().toLowerCase())
}

export function isCounterpartyKeyId(value: string): boolean {
  return KEY_ID.test(value.trim().toLowerCase())
}

export function isHexBlob(value: string): boolean {
  const trimmed = value.trim().toLowerCase()
  return HEX_BLOB.test(trimmed) && trimmed.length % 2 === 0
}

export function isIsoDateTime(value: string): boolean {
  if (!ISO_TIME.test(value.trim())) return false
  return !Number.isNaN(Date.parse(value.trim()))
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

export function expiresAtFrom(grantedAt: string, days: number): string {
  const date = new Date(grantedAt)
  date.setTime(date.getTime() + days * 24 * 60 * 60 * 1000)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function assertLabel(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Name the payment.')
  if (trimmed.length > LABEL_MAX) throw new Error(`The name must be at most ${LABEL_MAX} characters.`)
  if (/[\r\n]/.test(trimmed)) throw new Error('The name must be one line.')
  return trimmed
}

export function assertLine(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Add a line note. It stays sealed.')
  if (trimmed.length > LINE_MAX) throw new Error(`The line note must be at most ${LINE_MAX} characters.`)
  if (/[\r\n]/.test(trimmed)) throw new Error('The line note must be one line.')
  return trimmed
}

export function parseAmount(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < AMOUNT_MIN || value > AMOUNT_MAX) return null
    return value
  }
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < AMOUNT_MIN || parsed > AMOUNT_MAX) return null
  return parsed
}

export function parseGrantDays(value: string | number): number | null {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || value < GRANT_DAYS_MIN || value > GRANT_DAYS_MAX) return null
    return value
  }
  const trimmed = value.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isInteger(parsed) || parsed < GRANT_DAYS_MIN || parsed > GRANT_DAYS_MAX) return null
  return parsed
}

/**
 * Fee in sats. `floor(amount × 25 / 10000)`, and at least 1 sat.
 * A public fee of F (when F > 1) estimates the amount to a 400-sat band.
 */
export function paymentFeeSats(amountSats: number): number {
  if (!Number.isInteger(amountSats) || amountSats < AMOUNT_MIN) {
    throw new Error('Amount must be a whole number of sats.')
  }
  const raw = Math.floor((amountSats * PAYMENT_FEE_BPS) / 10_000)
  return Math.max(PAYMENT_FEE_MIN, raw)
}

export function formatSats(sats: number): string {
  const n = Math.trunc(sats)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n.toLocaleString('en-US')} sats`
}

export function sealPlaintext(amountSats: number, lineNote: string): number[] {
  const amount = parseAmount(amountSats)
  if (amount === null) throw new Error('Amount must be a whole number of sats.')
  const note = assertLine(lineNote)
  return stringToUtf8Bytes(JSON.stringify({ v: 1, amountSats: amount, lineNote: note }))
}

export function openPlaintext(bytes: number[]): SealedAmount | null {
  try {
    const parsed = JSON.parse(utf8BytesToString(bytes)) as Partial<SealedAmount>
    if (parsed.v !== 1) return null
    if (typeof parsed.lineNote !== 'string') return null
    const amount = parseAmount(parsed.amountSats ?? NaN)
    if (amount === null) return null
    const note = parsed.lineNote.trim()
    if (!note || note.length > LINE_MAX || /[\r\n]/.test(note)) return null
    return { v: 1, amountSats: amount, lineNote: note }
  } catch {
    return null
  }
}

export function paymentBindingId(
  record: Pick<
    PaymentRecord,
    | 'label'
    | 'payer'
    | 'payerIdentity'
    | 'payeeIdentity'
    | 'payee'
    | 'desk'
    | 'counterpartyKeyId'
    | 'amountCipher'
    | 'feeSats'
    | 'paidAt'
  >
): string {
  return sha256Hex(JSON.stringify({
    v: 1,
    kind: 'payment',
    label: record.label.trim(),
    payer: record.payer.trim().toLowerCase(),
    payerIdentity: record.payerIdentity.trim().toLowerCase(),
    payeeIdentity: record.payeeIdentity.trim().toLowerCase(),
    payee: record.payee.trim().toLowerCase(),
    desk: record.desk.trim().toLowerCase(),
    counterpartyKeyId: record.counterpartyKeyId.trim().toLowerCase(),
    amountCipher: record.amountCipher.trim().toLowerCase(),
    feeSats: record.feeSats,
    paidAt: record.paidAt
  })).slice(0, 32)
}

export function grantBindingId(
  record: Pick<
    GrantRecord,
    'paymentId' | 'payer' | 'auditor' | 'scope' | 'expiresAt' | 'auditorCipher' | 'feeSats' | 'grantedAt'
  >
): string {
  return sha256Hex(JSON.stringify({
    v: 1,
    kind: 'grant',
    paymentId: record.paymentId.trim().toLowerCase(),
    payer: record.payer.trim().toLowerCase(),
    auditor: record.auditor.trim().toLowerCase(),
    scope: record.scope,
    expiresAt: record.expiresAt,
    auditorCipher: record.auditorCipher.trim().toLowerCase(),
    feeSats: record.feeSats,
    grantedAt: record.grantedAt
  })).slice(0, 32)
}

export function canonicalPaymentBytes(
  record: Pick<
    PaymentRecord,
    | 'paymentId'
    | 'label'
    | 'payer'
    | 'payerIdentity'
    | 'payeeIdentity'
    | 'payee'
    | 'desk'
    | 'counterpartyKeyId'
    | 'amountCipher'
    | 'feeSats'
    | 'paidAt'
  >
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'payment',
    paymentId: record.paymentId.trim().toLowerCase(),
    label: record.label.trim(),
    payer: record.payer.trim().toLowerCase(),
    payerIdentity: record.payerIdentity.trim().toLowerCase(),
    payeeIdentity: record.payeeIdentity.trim().toLowerCase(),
    payee: record.payee.trim().toLowerCase(),
    desk: record.desk.trim().toLowerCase(),
    counterpartyKeyId: record.counterpartyKeyId.trim().toLowerCase(),
    amountCipher: record.amountCipher.trim().toLowerCase(),
    feeSats: record.feeSats,
    paidAt: record.paidAt
  }))
}

export function canonicalAttestBytes(
  record: Pick<AttestRecord, 'paymentId' | 'signer' | 'attestedAt'>
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'attest',
    paymentId: record.paymentId.trim().toLowerCase(),
    signer: record.signer.trim().toLowerCase(),
    attestedAt: record.attestedAt
  }))
}

export function canonicalGrantBytes(
  record: Pick<
    GrantRecord,
    'grantId' | 'paymentId' | 'payer' | 'auditor' | 'scope' | 'expiresAt' | 'auditorCipher' | 'feeSats' | 'grantedAt'
  >
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'grant',
    grantId: record.grantId.trim().toLowerCase(),
    paymentId: record.paymentId.trim().toLowerCase(),
    payer: record.payer.trim().toLowerCase(),
    auditor: record.auditor.trim().toLowerCase(),
    scope: record.scope,
    expiresAt: record.expiresAt,
    auditorCipher: record.auditorCipher.trim().toLowerCase(),
    feeSats: record.feeSats,
    grantedAt: record.grantedAt
  }))
}

export function canonicalRevokeBytes(
  record: Pick<RevokeRecord, 'grantId' | 'paymentId' | 'payer' | 'revokedAt'>
): number[] {
  return stringToUtf8Bytes(JSON.stringify({
    v: 1,
    kind: 'revoke',
    grantId: record.grantId.trim().toLowerCase(),
    paymentId: record.paymentId.trim().toLowerCase(),
    payer: record.payer.trim().toLowerCase(),
    revokedAt: record.revokedAt
  }))
}

export function paymentSignatureOk(record: PaymentRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.payer.trim(), canonicalPaymentBytes(record), der)
}

export function attestSignatureOk(record: AttestRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.signer.trim(), canonicalAttestBytes(record), der)
}

export function grantSignatureOk(record: GrantRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.payer.trim(), canonicalGrantBytes(record), der)
}

export function revokeSignatureOk(record: RevokeRecord): boolean {
  const der = hexToBytes(record.signature)
  if (!der) return false
  return verifyWalletDataSignature(record.payer.trim(), canonicalRevokeBytes(record), der)
}

export function validatePayment(record: PaymentRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a private pay record.'
  if (record.kind !== 'payment') return 'Not a payment record.'
  if (!isPaymentId(record.paymentId)) return 'Payment id is missing.'
  try {
    assertLabel(record.label)
  } catch (error) {
    return error instanceof Error ? error.message : 'The name is invalid.'
  }
  if (!isIdentityKey(record.payer)) return 'Payer signing key is missing.'
  if (!isIdentityKey(record.payerIdentity)) return 'Payer identity is missing.'
  if (!isIdentityKey(record.payeeIdentity)) return 'Payee identity is missing.'
  if (!isIdentityKey(record.payee)) return 'Payee signing key is missing.'
  if (!isIdentityKey(record.desk)) return 'Desk key is missing.'
  if (!isCounterpartyKeyId(record.counterpartyKeyId)) return 'Counterparty key id is missing.'
  if (!isHexBlob(record.amountCipher)) return 'Sealed amount is missing.'
  if (!Number.isInteger(record.feeSats) || record.feeSats < PAYMENT_FEE_MIN) return 'Payment fee is missing.'
  if (!isIsoDateTime(record.paidAt)) return 'Paid time is missing.'
  if (record.paymentId.trim().toLowerCase() !== paymentBindingId(record)) {
    return 'Payment id does not match this payment.'
  }
  if (!paymentSignatureOk(record)) return 'This payment is not signed by the payer.'
  return null
}

export function validateAttest(record: AttestRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a private pay record.'
  if (record.kind !== 'attest') return 'Not an attestation.'
  if (!isPaymentId(record.paymentId)) return 'Payment id is missing.'
  if (!isIdentityKey(record.signer)) return 'Payee signing key is missing.'
  if (!isIsoDateTime(record.attestedAt)) return 'Attested time is missing.'
  if (!attestSignatureOk(record)) return 'This attestation is not signed by that payee.'
  return null
}

export function validateGrant(record: GrantRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a private pay record.'
  if (record.kind !== 'grant') return 'Not a view grant.'
  if (!isPaymentId(record.grantId)) return 'Grant id is missing.'
  if (!isPaymentId(record.paymentId)) return 'Payment id is missing.'
  if (!isIdentityKey(record.payer)) return 'Payer signing key is missing.'
  if (!isIdentityKey(record.auditor)) return 'Auditor identity is missing.'
  if (record.scope !== VIEW_SCOPE) return 'View scope is missing.'
  if (!isIsoDateTime(record.expiresAt)) return 'View expiry is missing.'
  if (!isHexBlob(record.auditorCipher)) return 'Sealed auditor view is missing.'
  if (record.feeSats !== AUDIT_VIEW_FEE_SATS) return 'Audit-view grant fee does not match.'
  if (!isIsoDateTime(record.grantedAt)) return 'Granted time is missing.'
  if (record.expiresAt <= record.grantedAt) return 'View expiry must be after the grant.'
  if (record.grantId.trim().toLowerCase() !== grantBindingId(record)) {
    return 'Grant id does not match this grant.'
  }
  if (!grantSignatureOk(record)) return 'This grant is not signed by the payer.'
  return null
}

export function validateRevoke(record: RevokeRecord): string | null {
  if (record.magic !== MAGIC) return 'Not a private pay record.'
  if (record.kind !== 'revoke') return 'Not a revoke.'
  if (!isPaymentId(record.grantId)) return 'Grant id is missing.'
  if (!isPaymentId(record.paymentId)) return 'Payment id is missing.'
  if (!isIdentityKey(record.payer)) return 'Payer signing key is missing.'
  if (!isIsoDateTime(record.revokedAt)) return 'Revoked time is missing.'
  if (!revokeSignatureOk(record)) return 'This revoke is not signed by the payer.'
  return null
}

function textFields(parts: string[]): number[][] {
  return parts.map((part) => stringToUtf8Bytes(part))
}

export function encodePaymentFields(
  record: Omit<PaymentRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: PaymentRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'payment', ...record }
  const invalid = validatePayment(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'payment',
    record.paymentId.toLowerCase(),
    record.label.trim(),
    record.payer,
    record.payerIdentity,
    record.payeeIdentity,
    record.payee,
    record.desk,
    record.counterpartyKeyId.toLowerCase(),
    record.amountCipher.toLowerCase(),
    String(record.feeSats),
    record.paidAt,
    record.signature.trim().toLowerCase()
  ])
}

export function encodeAttestFields(
  record: Omit<AttestRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: AttestRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'attest', ...record }
  const invalid = validateAttest(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'attest',
    record.paymentId.toLowerCase(),
    record.signer,
    record.attestedAt,
    record.signature.trim().toLowerCase()
  ])
}

export function encodeGrantFields(
  record: Omit<GrantRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: GrantRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'grant', ...record }
  const invalid = validateGrant(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'grant',
    record.grantId.toLowerCase(),
    record.paymentId.toLowerCase(),
    record.payer,
    record.auditor,
    record.scope,
    record.expiresAt,
    record.auditorCipher.toLowerCase(),
    String(record.feeSats),
    record.grantedAt,
    record.signature.trim().toLowerCase()
  ])
}

export function encodeRevokeFields(
  record: Omit<RevokeRecord, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: RevokeRecord = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'revoke', ...record }
  const invalid = validateRevoke(payload)
  if (invalid) throw new Error(invalid)
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'revoke',
    record.grantId.toLowerCase(),
    record.paymentId.toLowerCase(),
    record.payer,
    record.revokedAt,
    record.signature.trim().toLowerCase()
  ])
}

function integerAt(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null
  const parsed = Number(raw)
  if (!Number.isSafeInteger(parsed)) return null
  return parsed
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

export function parsePrivatePayFields(fields: Array<number[] | Uint8Array>): PrivatePayPayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  try {
    const rest = fields.slice(start + 1).map((field) => fieldUtf8(field))
    if (rest.length < 3) return null
    if (rest[0] !== SCHEMA_VERSION) return null
    const kind = rest[1]
    if (kind === 'payment') {
      if (rest.length < 14) return null
      const feeSats = integerAt(rest[11] ?? '')
      if (feeSats === null) return null
      const record: PaymentRecord = {
        magic: MAGIC,
        version: SCHEMA_VERSION,
        kind: 'payment',
        paymentId: (rest[2] ?? '').toLowerCase(),
        label: rest[3] ?? '',
        payer: rest[4] ?? '',
        payerIdentity: rest[5] ?? '',
        payeeIdentity: rest[6] ?? '',
        payee: rest[7] ?? '',
        desk: rest[8] ?? '',
        counterpartyKeyId: (rest[9] ?? '').toLowerCase(),
        amountCipher: (rest[10] ?? '').toLowerCase(),
        feeSats,
        paidAt: rest[12] ?? '',
        signature: (rest[13] ?? '').toLowerCase()
      }
      return validatePayment(record) ? null : record
    }
    if (kind === 'attest') {
      if (rest.length < 6) return null
      const record: AttestRecord = {
        magic: MAGIC,
        version: SCHEMA_VERSION,
        kind: 'attest',
        paymentId: (rest[2] ?? '').toLowerCase(),
        signer: rest[3] ?? '',
        attestedAt: rest[4] ?? '',
        signature: (rest[5] ?? '').toLowerCase()
      }
      return validateAttest(record) ? null : record
    }
    if (kind === 'grant') {
      if (rest.length < 12) return null
      const feeSats = integerAt(rest[9] ?? '')
      if (feeSats === null) return null
      const record: GrantRecord = {
        magic: MAGIC,
        version: SCHEMA_VERSION,
        kind: 'grant',
        grantId: (rest[2] ?? '').toLowerCase(),
        paymentId: (rest[3] ?? '').toLowerCase(),
        payer: rest[4] ?? '',
        auditor: rest[5] ?? '',
        scope: rest[6] as typeof VIEW_SCOPE,
        expiresAt: rest[7] ?? '',
        auditorCipher: (rest[8] ?? '').toLowerCase(),
        feeSats,
        grantedAt: rest[10] ?? '',
        signature: (rest[11] ?? '').toLowerCase()
      }
      return validateGrant(record) ? null : record
    }
    if (kind === 'revoke') {
      if (rest.length < 7) return null
      const record: RevokeRecord = {
        magic: MAGIC,
        version: SCHEMA_VERSION,
        kind: 'revoke',
        grantId: (rest[2] ?? '').toLowerCase(),
        paymentId: (rest[3] ?? '').toLowerCase(),
        payer: rest[4] ?? '',
        revokedAt: rest[5] ?? '',
        signature: (rest[6] ?? '').toLowerCase()
      }
      return validateRevoke(record) ? null : record
    }
    return null
  } catch {
    return null
  }
}

export function grantIsRevoked(grant: GrantRecord, revokes: RevokeRecord[]): boolean {
  return revokes.some((row) =>
    sameIdentity(row.grantId, grant.grantId)
    && sameIdentity(row.paymentId, grant.paymentId)
    && sameIdentity(row.payer, grant.payer)
  )
}

export function grantIsOpen(grant: GrantRecord, revokes: RevokeRecord[], now: string): boolean {
  if (grantIsRevoked(grant, revokes)) return false
  return grant.expiresAt > now
}

export function foldPayment(
  payment: PaymentRecord,
  attests: AttestRecord[],
  grants: GrantRecord[],
  revokes: RevokeRecord[],
  now = nowIso()
): FoldedPayment {
  const attestation = attests
    .filter((row) => row.paymentId === payment.paymentId && sameIdentity(row.signer, payment.payee))
    .sort((left, right) => left.attestedAt.localeCompare(right.attestedAt))[0] ?? null
  const mine = grants
    .filter((row) => row.paymentId === payment.paymentId && sameIdentity(row.payer, payment.payer))
    .sort((left, right) => left.grantedAt.localeCompare(right.grantedAt))
  const closed = revokes.filter((row) =>
    row.paymentId === payment.paymentId && sameIdentity(row.payer, payment.payer)
  )
  const openViews = mine.filter((row) => grantIsOpen(row, closed, now)).length
  return {
    payment,
    attestation,
    grants: mine,
    revokes: closed,
    viewGranted: mine.length > 0,
    openViews
  }
}

export function listPayments<T extends PaymentRecord>(rows: T[]): T[] {
  return [...rows].sort((left, right) => {
    const time = right.paidAt.localeCompare(left.paidAt)
    if (time !== 0) return time
    return right.paymentId.localeCompare(left.paymentId)
  })
}

export function buildReading(folded: FoldedPayment, exportedAt: string): PrivatePayReading {
  return {
    kind: 'private-pay-reading',
    paymentId: folded.payment.paymentId,
    label: folded.payment.label,
    counterpartyKeyId: folded.payment.counterpartyKeyId,
    feeSats: folded.payment.feeSats,
    paidAt: folded.payment.paidAt,
    attested: folded.attestation !== null,
    attestedAt: folded.attestation?.attestedAt ?? null,
    viewGranted: folded.viewGranted,
    openViews: folded.openViews,
    amountSats: null,
    lineNote: null,
    exportedAt
  }
}

export function viewRole(identityKey: string, folded: FoldedPayment, now = nowIso()): ViewRole | null {
  if (sameIdentity(identityKey, folded.payment.payerIdentity)) return 'payer'
  if (sameIdentity(identityKey, folded.payment.payeeIdentity)) return 'payee'
  const open = folded.grants.some((grant) =>
    grantIsOpen(grant, folded.revokes, now) && sameIdentity(grant.auditor, identityKey)
  )
  return open ? 'auditor' : null
}

export function openGrantFor(
  identityKey: string,
  folded: FoldedPayment,
  now = nowIso()
): GrantRecord | null {
  const matches = folded.grants.filter((grant) =>
    grantIsOpen(grant, folded.revokes, now) && sameIdentity(grant.auditor, identityKey)
  )
  return matches[matches.length - 1] ?? null
}

export function readingSlug(label: string): string {
  const slug = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return slug || 'payment'
}
