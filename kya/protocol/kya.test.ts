import { describe, expect, it } from 'vitest'
import {
  DEFAULT_VERIFY_SATS,
  MAGIC,
  PROTOCOL_FEE_BPS,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  canIssue,
  canRegister,
  canVerify,
  encodeBindFields,
  encodeCredentialFields,
  encodeReceiptFields,
  formatSats,
  isOwner,
  kyaStatus,
  makeCredentialId,
  parseKyaFields,
  protocolFeeSats,
  sheetTitle,
  type KyaBind,
  type KyaCredential,
  type KyaReceipt
} from './kya'

const OWNER = `02${'ab'.repeat(32)}`
const VERIFIER = `03${'cd'.repeat(32)}`
const AGENT_ID = 'a'.repeat(32)

function bind(partial: Partial<KyaBind> = {}): KyaBind {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'bind',
    agentId: AGENT_ID,
    agentName: 'Travel clerk',
    ownerName: 'Northwind',
    ownerIdentity: OWNER,
    createdAt: '2026-09-01T12:00:00Z',
    ...partial
  }
}

function credential(partial: Partial<KyaCredential> = {}): KyaCredential {
  const issuedAt = partial.issuedAt ?? '2026-09-01T13:00:00Z'
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'credential',
    agentId: AGENT_ID,
    credentialId: makeCredentialId(AGENT_ID, OWNER, issuedAt, 'aa'),
    ownerIdentity: OWNER,
    issuedAt,
    ...partial
  }
}

function receipt(partial: Partial<KyaReceipt> = {}): KyaReceipt {
  const cred = credential()
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'receipt',
    agentId: AGENT_ID,
    credentialId: cred.credentialId,
    verifierIdentity: VERIFIER,
    verifierName: 'Desk',
    feeSats: DEFAULT_VERIFY_SATS,
    protocolFeeSats: protocolFeeSats(DEFAULT_VERIFY_SATS),
    verifiedAt: '2026-09-01T14:00:00Z',
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('kya protocol', () => {
  it('uses a distinct MAGIC and ≥5-char protocol string', () => {
    expect(MAGIC).toBe('kya')
    expect(PROTOCOL_ID).toEqual([0, 'kya-desk'])
    expect(PROTOCOL_ID[1].length).toBeGreaterThanOrEqual(5)
    expect(MAGIC).not.toBe('jobescrow')
    expect(MAGIC).not.toBe('vault')
    expect(MAGIC).not.toBe('trace')
  })

  it('round-trips bind, credential, and receipt', () => {
    const row = bind()
    const cred = credential()
    const paid = receipt()
    expect(fieldTexts(encodeBindFields(row))).toEqual([
      MAGIC, SCHEMA_VERSION, 'bind', row.agentId, row.agentName, row.ownerName, row.ownerIdentity, row.createdAt
    ])
    expect(parseKyaFields(encodeBindFields(row))).toEqual(row)
    expect(parseKyaFields(encodeCredentialFields(cred))).toEqual(cred)
    expect(parseKyaFields(encodeReceiptFields(paid))).toEqual(paid)
    expect(paid.protocolFeeSats).toBe(10)
    expect(PROTOCOL_FEE_BPS).toBe(200)
  })

  it('still parses when extra fields sit before MAGIC', () => {
    const extra = [Array.from(new TextEncoder().encode('pubkey'))]
    expect(parseKyaFields([...extra, ...encodeBindFields(bind())])).toEqual(bind())
  })

  it('walks Register → Issue → Verify and keeps protocol fee labeled', () => {
    expect(kyaStatus({})).toBeNull()
    expect(sheetTitle(null)).toBe('Register')
    expect(canRegister(null)).toBe(true)
    expect(canIssue(null)).toBe(false)
    expect(canVerify(null)).toBe(false)

    expect(kyaStatus({ bind: bind() })).toBe('registered')
    expect(sheetTitle('registered')).toBe('Issue')
    expect(canIssue('registered')).toBe(true)

    expect(kyaStatus({ bind: bind(), credential: credential() })).toBe('issued')
    expect(sheetTitle('issued')).toBe('Verify')
    expect(canVerify('issued')).toBe(true)

    expect(kyaStatus({ bind: bind(), credential: credential(), receipts: [receipt()] })).toBe('verified')
    expect(sheetTitle('verified')).toBe('Verified')
    expect(canVerify('verified')).toBe(true)
    expect(isOwner(bind(), OWNER)).toBe(true)
    expect(isOwner(bind(), VERIFIER)).toBe(false)
    expect(formatSats(1)).toBe('1 sat')
    expect(formatSats(500)).toBe('500 sats')
    expect(formatSats(500)).not.toMatch(/\$/)
    expect(protocolFeeSats(500)).toBe(10)
  })

  it('rejects an empty agent or owner name', () => {
    expect(() => encodeBindFields(bind({ agentName: '' }))).toThrow('Agent name is required.')
    expect(() => encodeBindFields(bind({ ownerName: '   ' }))).toThrow('Owner name is required.')
    expect(parseKyaFields(encodeBindFields(bind()))).not.toBeNull()
  })

  it('hashes a stable credential id', () => {
    const first = makeCredentialId(AGENT_ID, OWNER, '2026-09-01T13:00:00Z', 'aa')
    const second = makeCredentialId(AGENT_ID, OWNER, '2026-09-01T13:00:00Z', 'aa')
    const other = makeCredentialId(AGENT_ID, OWNER, '2026-09-01T13:00:00Z', 'bb')
    expect(first).toMatch(/^[0-9a-f]{64}$/)
    expect(first).toBe(second)
    expect(first).not.toBe(other)
  })
})
