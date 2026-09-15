import { sha256Hex } from './sha256'

/**
 * KYA desk protocol (PushDrop / BRC-48 fields).
 *
 * Register an agent ↔ owner binding. Issue a signed credential.
 * A third party pays a small fee to verify who stands behind the
 * agent. Overlay keeps the receipt. MAGIC `kya`. Public Pages uses
 * tm_anytx / ls_anytx. Client filters on MAGIC.
 *
 * Visa / Mastercard / Ant-style agent verification. Apps pay for
 * proofs. Not Session AP, Spend Policy, Trace, Job escrow, Vault
 * Claim, or StreamPay.
 */

export const PROTOCOL_ID: [0, string] = [0, 'kya-desk']
export const BASKET = 'kya-desk'
export const MAGIC = 'kya'
export const SCHEMA_VERSION = '1'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MESSAGE_BOX = 'kya-desk'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'

export const NAME_MAX = 80
export const MIN_VERIFY_SATS = 1
export const MAX_VERIFY_SATS = 1_000_000_000
export const DEFAULT_AGENT_NAME = 'Travel clerk'
export const DEFAULT_OWNER_NAME = 'Northwind'
export const DEFAULT_VERIFY_SATS = 500
/** Flat-ish story fee. Taken as a separately labeled output on verify. */
export const PROTOCOL_FEE_BPS = 200
export const BIND_SATS = 1
export const CREDENTIAL_SATS = 1
export const RECEIPT_SATS = 1

export const KINDS = ['bind', 'credential', 'receipt'] as const
export type KyaKind = (typeof KINDS)[number]

export type KyaStatus = 'registered' | 'issued' | 'verified'
export type SheetTitle = 'Register' | 'Issue' | 'Verify' | 'Verified'

export interface KyaBind {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'bind'
  agentId: string
  agentName: string
  ownerName: string
  ownerIdentity: string
  createdAt: string
}

export interface KyaCredential {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'credential'
  agentId: string
  credentialId: string
  ownerIdentity: string
  issuedAt: string
}

export interface KyaReceipt {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'receipt'
  agentId: string
  credentialId: string
  verifierIdentity: string
  verifierName: string
  feeSats: number
  protocolFeeSats: number
  verifiedAt: string
}

export type KyaPayload = KyaBind | KyaCredential | KyaReceipt

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const AGENT_ID = /^[0-9a-f]{32}$/
const CREDENTIAL_ID = /^[0-9a-f]{64}$/
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

export function isAgentId(value: string): boolean {
  return AGENT_ID.test(value.trim().toLowerCase())
}

export function isCredentialId(value: string): boolean {
  return CREDENTIAL_ID.test(value.trim().toLowerCase())
}

export function isIsoDateTime(value: string): boolean {
  const trimmed = value.trim()
  if (!ISO_TIME.test(trimmed)) return false
  const date = new Date(trimmed)
  return !Number.isNaN(date.getTime())
}

export function newAgentId(): string {
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

export function assertVerifySats(sats: number): void {
  if (!Number.isInteger(sats) || sats < MIN_VERIFY_SATS || sats > MAX_VERIFY_SATS) {
    throw new Error(`Verify fee must be an integer between ${MIN_VERIFY_SATS} and ${MAX_VERIFY_SATS} sats`)
  }
}

export function protocolFeeSats(verifySats: number): number {
  assertVerifySats(verifySats)
  return Math.max(1, Math.floor((verifySats * PROTOCOL_FEE_BPS) / 10_000))
}

export function formatSats(sats: number): string {
  const n = Math.trunc(sats)
  if (!Number.isFinite(n) || n < 0) return '0 sats'
  return n === 1 ? '1 sat' : `${n} sats`
}

export function makeCredentialId(
  agentId: string,
  ownerIdentity: string,
  issuedAt: string,
  nonce: string
): string {
  return sha256Hex([agentId, ownerIdentity, issuedAt, nonce].join('\n'))
}

export function kyaStatus(parts: {
  bind?: unknown
  credential?: unknown
  receipts?: unknown[]
}): KyaStatus | null {
  if (!parts.bind) return null
  if (parts.receipts && parts.receipts.length > 0) return 'verified'
  if (parts.credential) return 'issued'
  return 'registered'
}

export function sheetTitle(status: KyaStatus | null): SheetTitle {
  switch (status) {
    case 'registered':
      return 'Issue'
    case 'issued':
      return 'Verify'
    case 'verified':
      return 'Verified'
    default:
      return 'Register'
  }
}

export function canRegister(status: KyaStatus | null): boolean {
  return status === null
}

export function canIssue(status: KyaStatus | null): boolean {
  return status === 'registered'
}

export function canVerify(status: KyaStatus | null): boolean {
  return status === 'issued' || status === 'verified'
}

export function sameIdentity(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase()
}

export function isOwner(bind: Pick<KyaBind, 'ownerIdentity'>, identityKey: string): boolean {
  return sameIdentity(bind.ownerIdentity, identityKey)
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

export function validateBind(bind: KyaBind): string | null {
  if (bind.magic !== MAGIC) return 'Not a KYA record.'
  if (bind.kind !== 'bind') return 'Not a bind record.'
  if (!isAgentId(bind.agentId)) return 'Agent id is missing.'
  try {
    assertName(bind.agentName, 'Agent name')
  } catch (error) {
    return error instanceof Error ? error.message : 'Agent name is invalid.'
  }
  try {
    assertName(bind.ownerName, 'Owner name')
  } catch (error) {
    return error instanceof Error ? error.message : 'Owner name is invalid.'
  }
  if (!isIdentityKey(bind.ownerIdentity)) return 'Owner identity is missing.'
  if (!isIsoDateTime(bind.createdAt)) return 'Created time is missing.'
  return null
}

export function validateCredential(credential: KyaCredential): string | null {
  if (credential.magic !== MAGIC) return 'Not a KYA record.'
  if (credential.kind !== 'credential') return 'Not a credential record.'
  if (!isAgentId(credential.agentId)) return 'Agent id is missing.'
  if (!isCredentialId(credential.credentialId)) return 'Credential id is missing.'
  if (!isIdentityKey(credential.ownerIdentity)) return 'Owner identity is missing.'
  if (!isIsoDateTime(credential.issuedAt)) return 'Issued time is missing.'
  return null
}

export function validateReceipt(receipt: KyaReceipt): string | null {
  if (receipt.magic !== MAGIC) return 'Not a KYA record.'
  if (receipt.kind !== 'receipt') return 'Not a receipt record.'
  if (!isAgentId(receipt.agentId)) return 'Agent id is missing.'
  if (!isCredentialId(receipt.credentialId)) return 'Credential id is missing.'
  if (!isIdentityKey(receipt.verifierIdentity)) return 'Verifier identity is missing.'
  if (receipt.verifierName.length > NAME_MAX) return 'Verifier name too long.'
  try {
    assertVerifySats(receipt.feeSats)
  } catch (error) {
    return error instanceof Error ? error.message : 'Verify fee is invalid.'
  }
  if (!Number.isInteger(receipt.protocolFeeSats) || receipt.protocolFeeSats < 1) {
    return 'Protocol fee must be at least 1 sat.'
  }
  if (!isIsoDateTime(receipt.verifiedAt)) return 'Verified time is missing.'
  return null
}

export function encodeBindFields(bind: Omit<KyaBind, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: KyaBind = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'bind', ...bind }
  const invalid = validateBind(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('bind'),
    stringToUtf8Bytes(bind.agentId),
    stringToUtf8Bytes(bind.agentName.trim()),
    stringToUtf8Bytes(bind.ownerName.trim()),
    stringToUtf8Bytes(bind.ownerIdentity),
    stringToUtf8Bytes(bind.createdAt)
  ]
}

export function encodeCredentialFields(
  credential: Omit<KyaCredential, 'magic' | 'version' | 'kind'>
): number[][] {
  const payload: KyaCredential = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'credential', ...credential }
  const invalid = validateCredential(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('credential'),
    stringToUtf8Bytes(credential.agentId),
    stringToUtf8Bytes(credential.credentialId),
    stringToUtf8Bytes(credential.ownerIdentity),
    stringToUtf8Bytes(credential.issuedAt)
  ]
}

export function encodeReceiptFields(receipt: Omit<KyaReceipt, 'magic' | 'version' | 'kind'>): number[][] {
  const payload: KyaReceipt = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'receipt', ...receipt }
  const invalid = validateReceipt(payload)
  if (invalid) throw new Error(invalid)
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('receipt'),
    stringToUtf8Bytes(receipt.agentId),
    stringToUtf8Bytes(receipt.credentialId),
    stringToUtf8Bytes(receipt.verifierIdentity),
    stringToUtf8Bytes(receipt.verifierName.trim()),
    stringToUtf8Bytes(String(receipt.feeSats)),
    stringToUtf8Bytes(String(receipt.protocolFeeSats)),
    stringToUtf8Bytes(receipt.verifiedAt)
  ]
}

function bindFromParts(parts: Omit<KyaBind, 'magic' | 'version' | 'kind'>): KyaBind | null {
  const bind: KyaBind = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'bind', ...parts }
  return validateBind(bind) ? null : bind
}

function credentialFromParts(
  parts: Omit<KyaCredential, 'magic' | 'version' | 'kind'>
): KyaCredential | null {
  const credential: KyaCredential = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'credential', ...parts }
  return validateCredential(credential) ? null : credential
}

function receiptFromParts(parts: Omit<KyaReceipt, 'magic' | 'version' | 'kind'>): KyaReceipt | null {
  const receipt: KyaReceipt = { magic: MAGIC, version: SCHEMA_VERSION, kind: 'receipt', ...parts }
  return validateReceipt(receipt) ? null : receipt
}

export function parseKyaFields(fields: Array<number[] | Uint8Array>): KyaPayload | null {
  const semantic = semanticFields(fields)
  const start = magicIndex(semantic)
  if (start < 0) return null
  const rest = semantic.slice(start + 1).map((field) => fieldUtf8(field))
  if (rest.length < 3) return null
  const version = rest[0]
  const kind = rest[1]
  if (version !== SCHEMA_VERSION) return null
  if (kind === 'bind') {
    if (rest.length < 7) return null
    return bindFromParts({
      agentId: rest[2],
      agentName: rest[3],
      ownerName: rest[4],
      ownerIdentity: rest[5],
      createdAt: rest[6]
    })
  }
  if (kind === 'credential') {
    if (rest.length < 6) return null
    return credentialFromParts({
      agentId: rest[2],
      credentialId: rest[3],
      ownerIdentity: rest[4],
      issuedAt: rest[5]
    })
  }
  if (kind === 'receipt') {
    if (rest.length < 9) return null
    const feeSats = Number(rest[6])
    const protocolFeeSatsValue = Number(rest[7])
    if (!Number.isInteger(feeSats) || !Number.isInteger(protocolFeeSatsValue)) return null
    return receiptFromParts({
      agentId: rest[2],
      credentialId: rest[3],
      verifierIdentity: rest[4],
      verifierName: rest[5],
      feeSats,
      protocolFeeSats: protocolFeeSatsValue,
      verifiedAt: rest[8]
    })
  }
  return null
}

export function shortId(value: string, size = 8): string {
  if (value.length <= size * 2) return value
  return `${value.slice(0, size)}…${value.slice(-6)}`
}

export function latestBind(rows: KyaBind[]): KyaBind | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null
}

export function latestCredential(rows: KyaCredential[]): KyaCredential | null {
  if (rows.length === 0) return null
  return [...rows].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt))[0] ?? null
}

export function receiptsNewestFirst(rows: KyaReceipt[]): KyaReceipt[] {
  return [...rows].sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt))
}
