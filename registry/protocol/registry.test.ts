import { describe, expect, it } from 'vitest'
import {
  AUM_SUBSCRIPTION_SATS,
  MAGIC,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  TRANSFER_FEE_SATS,
  buildReading,
  encodeIssueFields,
  encodeRegisterFields,
  encodeTransferFields,
  foldRegister,
  isAdmin,
  makeIssueId,
  parseRegistryFields,
  parseTotalUnits,
  resolveHolderRef,
  type IssueRecord,
  type RegisterRecord,
  type TransferRecord
} from './registry'

const ADMIN = `02${'ab'.repeat(32)}`
const HOLDER = `03${'cd'.repeat(32)}`
const OTHER = `02${'ef'.repeat(32)}`
const REGISTER_ID = 'a'.repeat(32)

function register(partial: Partial<RegisterRecord> = {}): RegisterRecord {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'register',
    registerId: REGISTER_ID,
    name: 'HOA unit ledger',
    unitLabel: 'units',
    totalUnits: 100,
    aumNote: '48 lots',
    admin: ADMIN,
    createdAt: '2026-09-22T12:00:00Z',
    ...partial
  }
}

function issue(partial: Partial<IssueRecord> = {}): IssueRecord {
  const issuedAt = partial.issuedAt ?? '2026-09-22T13:00:00Z'
  const holder = partial.holder ?? HOLDER
  const units = partial.units ?? 40
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'issue',
    registerId: REGISTER_ID,
    issueId: makeIssueId(REGISTER_ID, holder, units, issuedAt, 'aa'),
    holder,
    units,
    admin: ADMIN,
    issuedAt,
    ...partial
  }
}

function transfer(partial: Partial<TransferRecord> = {}): TransferRecord {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'transfer',
    registerId: REGISTER_ID,
    transferId: 'b'.repeat(64),
    from: HOLDER,
    to: OTHER,
    units: 10,
    feeSats: TRANSFER_FEE_SATS,
    protocolFeeSats: TRANSFER_FEE_SATS,
    actor: HOLDER,
    transferredAt: '2026-09-22T14:00:00Z',
    ...partial
  }
}

function fieldTexts(fields: number[][]): string[] {
  return fields.map((field) => new TextDecoder().decode(Uint8Array.from(field)))
}

describe('registry protocol', () => {
  it('uses MAGIC registry and a protocol string of at least 5 characters', () => {
    expect(MAGIC).toBe('registry')
    expect(MAGIC.length).toBeGreaterThanOrEqual(5)
    expect(PROTOCOL_ID).toEqual([0, 'registry'])
    expect(PROTOCOL_ID[1].length).toBeGreaterThanOrEqual(5)
    expect(AUM_SUBSCRIPTION_SATS).toBe(10_000)
    expect(TRANSFER_FEE_SATS).toBe(100)
  })

  it('round-trips a register, an issue, and a paid transfer', () => {
    const book = register()
    const issued = issue()
    const moved = transfer()
    expect(parseRegistryFields(encodeRegisterFields(book))).toEqual(book)
    expect(parseRegistryFields(encodeIssueFields(issued))).toEqual(issued)
    expect(parseRegistryFields(encodeTransferFields(moved))).toEqual(moved)
    expect(fieldTexts(encodeRegisterFields(book))[2]).toBe('register')
    expect(fieldTexts(encodeTransferFields(moved))[8]).toBe(String(TRANSFER_FEE_SATS))
  })

  it('reads a holder from an identity key or a share link', () => {
    expect(resolveHolderRef(HOLDER)).toBe(HOLDER)
    expect(resolveHolderRef(`https://example.test/registry/?r=${REGISTER_ID}&k=${HOLDER}`)).toBe(HOLDER)
    expect(resolveHolderRef('not-a-key')).toBeNull()
    expect(parseTotalUnits('')).toBeNull()
    expect(parseTotalUnits('48')).toBe(48)
    expect(() => parseTotalUnits('nope')).toThrow('Total units must be a whole number.')
  })

  it('folds issues and transfers into current holdings', () => {
    const book = register({ totalUnits: 100 })
    const first = issue({ units: 40, holder: HOLDER, issuedAt: '2026-09-22T13:00:00Z' })
    const second = issue({
      units: 60,
      holder: OTHER,
      issuedAt: '2026-09-22T13:30:00Z',
      issueId: 'c'.repeat(64)
    })
    const moved = transfer({ units: 10, from: HOLDER, to: OTHER })
    const fold = foldRegister(book, [first, second], [moved])
    expect(fold.issuedUnits).toBe(100)
    expect(fold.acceptedTransfers).toBe(1)
    expect(fold.holdings).toEqual([
      { holder: OTHER, units: 70 },
      { holder: HOLDER, units: 30 }
    ])
    expect(isAdmin(book, ADMIN)).toBe(true)
    expect(isAdmin(book, HOLDER)).toBe(false)
  })

  it('skips an over-issue and a transfer the holder cannot cover', () => {
    const book = register({ totalUnits: 50 })
    const first = issue({ units: 40 })
    const extra = issue({
      units: 20,
      issuedAt: '2026-09-22T13:10:00Z',
      issueId: 'd'.repeat(64)
    })
    const moved = transfer({ units: 41 })
    const fold = foldRegister(book, [first, extra], [moved])
    expect(fold.skippedIssues).toBe(1)
    expect(fold.skippedTransfers).toBe(1)
    expect(fold.issuedUnits).toBe(40)
    expect(fold.holdings).toEqual([{ holder: HOLDER, units: 40 }])
  })

  it('builds a stranger reading without a wallet field', () => {
    const book = register({ totalUnits: null, aumNote: '' })
    const fold = foldRegister(book, [issue()], [])
    const reading = buildReading(book, fold, '2026-09-22T15:00:00Z')
    expect(reading.kind).toBe('register-reading')
    expect(reading.holdings).toEqual([{ holder: HOLDER, units: 40 }])
    expect(reading.transferCount).toBe(0)
    expect(JSON.stringify(reading)).not.toMatch(/wallet/i)
  })
})
