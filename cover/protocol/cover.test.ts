import { describe, expect, it } from 'vitest'
import {
  CLAIM_ADMIN_FEE_SATS,
  DEFAULT_QUORUM,
  KIND_RATE_BPS,
  MAGIC,
  PREMIUM_CUT_BPS,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  admitRelease,
  buildReading,
  encodeApprovalFields,
  encodeClaimFields,
  encodePolicyFields,
  encodeReleaseFields,
  endsAtFrom,
  foldClaims,
  hashEvidenceFile,
  hashEvidenceText,
  makeClaimId,
  parseCoverFields,
  quoteCover,
  type ApprovalRecord,
  type ClaimRecord,
  type PolicyRecord,
  type ReleaseRecord
} from './cover'
import { sha256Hex } from './sha256'

const HOLDER = `02${'ab'.repeat(32)}`
const DESK = `03${'cd'.repeat(32)}`
const A1 = `02${'11'.repeat(32)}`
const A2 = `03${'22'.repeat(32)}`
const A3 = `02${'33'.repeat(32)}`
const POLICY_ID = 'a'.repeat(32)
const WHEN = '2026-09-29T12:00:00Z'

function policy(partial: Partial<PolicyRecord> = {}): PolicyRecord {
  const insuredSats = partial.insuredSats ?? 100_000
  const termDays = partial.termDays ?? 30
  const coverKind = partial.coverKind ?? 'event'
  const quote = quoteCover(coverKind, insuredSats, termDays)
  const boughtAt = partial.boughtAt ?? WHEN
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'policy',
    policyId: POLICY_ID,
    coverKind,
    subject: 'Spring fair',
    holder: HOLDER,
    desk: DESK,
    insuredSats,
    termDays,
    premiumSats: quote.premiumSats,
    premiumCutSats: quote.premiumCutSats,
    quorum: DEFAULT_QUORUM,
    approver1: A1,
    approver2: A2,
    approver3: A3,
    boughtAt,
    endsAt: endsAtFrom(boughtAt, termDays),
    ...partial
  }
}

function claim(book: PolicyRecord, partial: Partial<ClaimRecord> = {}): ClaimRecord {
  const filedAt = partial.filedAt ?? '2026-09-29T15:00:00Z'
  const evidenceHash = partial.evidenceHash ?? hashEvidenceText('The fair was cancelled.')
  const holder = partial.holder ?? book.holder
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'claim',
    policyId: book.policyId,
    claimId: makeClaimId(book.policyId, holder, evidenceHash, filedAt, 'aa'),
    holder,
    evidenceHash,
    payoutSats: partial.payoutSats ?? book.insuredSats,
    filedAt,
    ...partial
  }
}

function approval(book: PolicyRecord, filed: ClaimRecord, signer: string, approvedAt: string): ApprovalRecord {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'approval',
    policyId: book.policyId,
    claimId: filed.claimId,
    signer,
    approvedAt
  }
}

function release(book: PolicyRecord, filed: ClaimRecord, partial: Partial<ReleaseRecord> = {}): ReleaseRecord {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'release',
    policyId: book.policyId,
    claimId: filed.claimId,
    payoutSats: filed.payoutSats,
    claimAdminFeeSats: CLAIM_ADMIN_FEE_SATS,
    releaser: A2,
    releasedAt: '2026-09-29T18:00:00Z',
    ...partial
  }
}

describe('cover protocol', () => {
  it('uses MAGIC cover and a protocol string of at least 5 characters', () => {
    expect(MAGIC).toBe('cover')
    expect(MAGIC.length).toBeGreaterThanOrEqual(5)
    expect(PROTOCOL_ID).toEqual([0, 'cover'])
    expect(PREMIUM_CUT_BPS).toBe(1_000)
    expect(CLAIM_ADMIN_FEE_SATS).toBe(500)
    expect(KIND_RATE_BPS.event).toBe(300)
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  it('quotes a labeled premium cut that is part of the premium', () => {
    const event = quoteCover('event', 100_000, 30)
    expect(event).toEqual({ premiumSats: 3_000, premiumCutSats: 300, netPremiumSats: 2_700 })
    expect(quoteCover('contract', 100_000, 30).premiumSats).toBe(2_000)
    expect(quoteCover('contractor', 100_000, 30).premiumCutSats).toBe(250)
    const floor = quoteCover('contract', 10_000, 1)
    expect(floor.premiumSats).toBe(100)
    expect(floor.premiumCutSats).toBe(10)
    expect(floor.premiumSats).toBeLessThan(10_000)
    expect(event.premiumCutSats + event.netPremiumSats).toBe(event.premiumSats)
  })

  it('round-trips a policy, a claim, an approval, and a release', () => {
    const book = policy()
    const filed = claim(book)
    const agreed = approval(book, filed, A1, '2026-09-29T16:00:00Z')
    const opened = release(book, filed)
    expect(parseCoverFields(encodePolicyFields(book))).toEqual(book)
    expect(parseCoverFields(encodeClaimFields(filed))).toEqual(filed)
    expect(parseCoverFields(encodeApprovalFields(agreed))).toEqual(agreed)
    expect(parseCoverFields(encodeReleaseFields(opened))).toEqual(opened)
  })

  it('rejects a premium cut that does not match the quote', () => {
    const book = policy()
    expect(() => encodePolicyFields({ ...book, premiumCutSats: 1 })).toThrow(/Premium cut/)
    expect(() => encodePolicyFields({ ...book, premiumSats: book.premiumSats + 1 })).toThrow(/Premium/)
    expect(() => encodePolicyFields({
      ...book,
      approver3: book.approver1
    })).toThrow('Name three different approvers.')
    const fields = encodePolicyFields(book)
    fields[11] = Array.from(new TextEncoder().encode('1'))
    expect(parseCoverFields(fields)).toBeNull()
  })

  it('hashes evidence locally and rejects a claim without a hash', () => {
    expect(hashEvidenceText('  The fair was cancelled. ')).toBe(hashEvidenceText('The fair was cancelled.'))
    expect(hashEvidenceFile(new TextEncoder().encode('file-bytes'))).toHaveLength(64)
    expect(() => hashEvidenceText('   ')).toThrow(/Paste what happened/)
    const book = policy()
    const filed = claim(book, { evidenceHash: 'abcd' })
    expect(() => encodeClaimFields(filed)).toThrow(/Evidence/)
  })

  it('admits a release only after quorum, with the labeled claim-admin fee', () => {
    const book = policy({ quorum: 2 })
    const filed = claim(book)
    const first = approval(book, filed, A1, '2026-09-29T16:00:00Z')
    const second = approval(book, filed, A2, '2026-09-29T17:00:00Z')
    const stranger = approval(book, filed, HOLDER, '2026-09-29T16:30:00Z')
    const early = release(book, filed, { releasedAt: '2026-09-29T16:30:00Z', releaser: A1 })
    const opened = release(book, filed)
    expect(admitRelease(book, filed, [first], opened)).toBeNull()
    expect(admitRelease(book, filed, [first, second, stranger], early)).toBeNull()
    expect(admitRelease(book, filed, [first, second], opened)).toEqual(opened)
    expect(admitRelease(book, filed, [first, second], { ...opened, claimAdminFeeSats: 1 })).toBeNull()
    expect(admitRelease(book, filed, [first, second], { ...opened, payoutSats: 1 })).toBeNull()

    const folded = foldClaims(book, [filed], [first, second, stranger], [opened])
    expect(folded).toHaveLength(1)
    expect(folded[0]?.approvalCount).toBe(2)
    expect(folded[0]?.status).toBe('released')
    expect(folded[0]?.release?.claimAdminFeeSats).toBe(CLAIM_ADMIN_FEE_SATS)

    const waiting = foldClaims(book, [filed], [first], [])
    expect(waiting[0]?.status).toBe('filed')
    expect(waiting[0]?.quorumMet).toBe(false)
  })

  it('builds a stranger reading without a wallet field', () => {
    const book = policy()
    const filed = claim(book)
    const reading = buildReading(book, foldClaims(book, [filed], [], []), '2026-09-29T20:00:00Z')
    expect(reading.kind).toBe('cover-reading')
    expect(reading.premiumCutSats).toBe(book.premiumCutSats)
    expect(reading.claims[0]?.status).toBe('filed')
    expect(reading.claims[0]?.claimAdminFeeSats).toBeNull()
    expect(JSON.stringify(reading)).not.toMatch(/wallet/i)
  })

  it('ignores a foreign magic', () => {
    const fields = encodePolicyFields(policy())
    fields[0] = Array.from(new TextEncoder().encode('vouch'))
    expect(parseCoverFields(fields)).toBeNull()
  })
})
