import { PrivateKey, ProtoWallet, type WalletInterface } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  CLAIM_ADMIN_FEE_SATS,
  DEFAULT_QUORUM,
  KIND_RATE_BPS,
  MAGIC,
  PREMIUM_CUT_BPS,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  SIGNING_KEY_ID,
  admitRelease,
  buildReading,
  bytesToHex,
  canonicalApprovalBytes,
  canonicalClaimBytes,
  canonicalReleaseBytes,
  encodeApprovalFields,
  encodeClaimFields,
  encodePolicyFields,
  encodeReleaseFields,
  endsAtFrom,
  foldClaims,
  hashEvidenceFile,
  hashEvidenceText,
  listPolicies,
  makeClaimId,
  parseCoverFields,
  parseQuorum,
  policyBindingId,
  quoteCover,
  validatePolicy,
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
  const draft = {
    coverKind,
    subject: partial.subject ?? 'Spring fair',
    holder: partial.holder ?? HOLDER,
    desk: partial.desk ?? DESK,
    insuredSats,
    termDays,
    premiumSats: partial.premiumSats ?? quote.premiumSats,
    premiumCutSats: partial.premiumCutSats ?? quote.premiumCutSats,
    quorum: partial.quorum ?? DEFAULT_QUORUM,
    approver1: partial.approver1 ?? A1,
    approver2: partial.approver2 ?? A2,
    approver3: partial.approver3 ?? A3,
    boughtAt,
    endsAt: partial.endsAt ?? endsAtFrom(boughtAt, termDays)
  }
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'policy',
    policyId: policyBindingId(draft),
    ...draft
  }
}

async function party(): Promise<{ wallet: WalletInterface, publicKey: string }> {
  const wallet = new ProtoWallet(PrivateKey.fromRandom())
  const { publicKey } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return { wallet, publicKey }
}

async function signClaim(
  wallet: WalletInterface,
  record: Omit<ClaimRecord, 'signature' | 'magic' | 'version' | 'kind'>
): Promise<ClaimRecord> {
  const { signature } = await wallet.createSignature({
    data: canonicalClaimBytes(record),
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return { magic: MAGIC, version: SCHEMA_VERSION, kind: 'claim', ...record, signature: bytesToHex(signature) }
}

async function signApproval(
  wallet: WalletInterface,
  record: Omit<ApprovalRecord, 'signature' | 'magic' | 'version' | 'kind'>
): Promise<ApprovalRecord> {
  const { signature } = await wallet.createSignature({
    data: canonicalApprovalBytes(record),
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return { magic: MAGIC, version: SCHEMA_VERSION, kind: 'approval', ...record, signature: bytesToHex(signature) }
}

async function signRelease(
  wallet: WalletInterface,
  record: Omit<ReleaseRecord, 'signature' | 'magic' | 'version' | 'kind'>
): Promise<ReleaseRecord> {
  const { signature } = await wallet.createSignature({
    data: canonicalReleaseBytes(record),
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return { magic: MAGIC, version: SCHEMA_VERSION, kind: 'release', ...record, signature: bytesToHex(signature) }
}

function claimDraft(book: PolicyRecord, partial: Partial<ClaimRecord> = {}) {
  const filedAt = partial.filedAt ?? '2026-09-29T15:00:00Z'
  const evidenceHash = partial.evidenceHash ?? hashEvidenceText('The fair was cancelled.')
  const holder = partial.holder ?? book.holder
  return {
    policyId: book.policyId,
    claimId: partial.claimId ?? makeClaimId(book.policyId, holder, evidenceHash, filedAt, 'aa'),
    holder,
    evidenceHash,
    payoutSats: partial.payoutSats ?? book.insuredSats,
    filedAt
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

  it('round-trips a policy, a claim, an approval, and a release', async () => {
    const holder = await party()
    const approver = await party()
    const book = policy({ holder: holder.publicKey, approver1: approver.publicKey })
    const filed = await signClaim(holder.wallet, claimDraft(book))
    const agreed = await signApproval(approver.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      signer: approver.publicKey,
      approvedAt: '2026-09-29T16:00:00Z'
    })
    const opened = await signRelease(approver.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      payoutSats: filed.payoutSats,
      claimAdminFeeSats: CLAIM_ADMIN_FEE_SATS,
      releaser: approver.publicKey,
      releasedAt: '2026-09-29T18:00:00Z'
    })
    expect(parseCoverFields(encodePolicyFields(book))).toEqual(book)
    expect(parseCoverFields(encodeClaimFields(filed))).toEqual(filed)
    expect(parseCoverFields(encodeApprovalFields(agreed))).toEqual(agreed)
    expect(parseCoverFields(encodeReleaseFields(opened))).toEqual(opened)
    expect(() => encodeClaimFields({ ...filed, signature: 'aa' })).toThrow(/signed/)
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
    expect(() => encodeClaimFields({
      ...claimDraft(book, { evidenceHash: 'abcd' }),
      signature: 'aa'
    })).toThrow(/Evidence/)
  })

  it('admits a release only after quorum, with the labeled claim-admin fee', async () => {
    const holder = await party()
    const firstKey = await party()
    const secondKey = await party()
    const thirdKey = await party()
    const outsider = await party()
    const book = policy({
      quorum: 2,
      holder: holder.publicKey,
      approver1: firstKey.publicKey,
      approver2: secondKey.publicKey,
      approver3: thirdKey.publicKey
    })
    const filed = await signClaim(holder.wallet, claimDraft(book))
    const first = await signApproval(firstKey.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      signer: firstKey.publicKey,
      approvedAt: '2026-09-29T16:00:00Z'
    })
    const second = await signApproval(secondKey.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      signer: secondKey.publicKey,
      approvedAt: '2026-09-29T17:00:00Z'
    })
    const duplicate = await signApproval(firstKey.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      signer: firstKey.publicKey,
      approvedAt: '2026-09-29T16:30:00Z'
    })
    const stranger = await signApproval(outsider.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      signer: outsider.publicKey,
      approvedAt: '2026-09-29T16:40:00Z'
    })
    const forged = {
      ...first,
      signer: secondKey.publicKey
    }
    const early = await signRelease(firstKey.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      payoutSats: filed.payoutSats,
      claimAdminFeeSats: CLAIM_ADMIN_FEE_SATS,
      releaser: firstKey.publicKey,
      releasedAt: '2026-09-29T16:30:00Z'
    })
    const opened = await signRelease(secondKey.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      payoutSats: filed.payoutSats,
      claimAdminFeeSats: CLAIM_ADMIN_FEE_SATS,
      releaser: secondKey.publicKey,
      releasedAt: '2026-09-29T18:00:00Z'
    })
    expect(() => encodeApprovalFields(forged)).toThrow(/signed/)
    expect(admitRelease(book, filed, [first], opened)).toBeNull()
    expect(admitRelease(book, filed, [first, second, stranger], early)).toBeNull()
    expect(admitRelease(book, filed, [first, second], opened)).toEqual(opened)
    expect(admitRelease(book, filed, [first, duplicate, second, stranger, forged], opened)).toEqual(opened)
    expect(admitRelease(book, filed, [first, second], { ...opened, claimAdminFeeSats: 1 })).toBeNull()
    expect(admitRelease(book, filed, [first, second], { ...opened, payoutSats: 1 })).toBeNull()

    const folded = foldClaims(book, [filed], [first, duplicate, second, stranger, forged], [opened])
    expect(folded).toHaveLength(1)
    expect(folded[0]?.approvalCount).toBe(2)
    expect(folded[0]?.status).toBe('released')
    expect(folded[0]?.release?.claimAdminFeeSats).toBe(CLAIM_ADMIN_FEE_SATS)

    const waiting = foldClaims(book, [filed], [first, duplicate, stranger], [])
    expect(waiting[0]?.approvalCount).toBe(1)
    expect(waiting[0]?.status).toBe('filed')
    expect(waiting[0]?.quorumMet).toBe(false)
  })

  it('rejects quorum 1, requires quorum 3, and rejects the holder as an approver', async () => {
    expect(parseQuorum(1)).toBeNull()
    expect(parseQuorum('1')).toBeNull()
    expect(parseQuorum(2)).toBe(2)
    expect(parseQuorum(3)).toBe(3)
    const holder = await party()
    const a1 = await party()
    const a2 = await party()
    const a3 = await party()
    expect(validatePolicy(policy({
      holder: holder.publicKey,
      approver1: holder.publicKey,
      approver2: a2.publicKey,
      approver3: a3.publicKey
    }))).toMatch(/holder/i)
    expect(() => encodePolicyFields(policy({
      holder: holder.publicKey,
      approver1: holder.publicKey,
      approver2: a2.publicKey,
      approver3: a3.publicKey,
      policyId: 'ignored'
    }))).toThrow(/holder/i)

    const book = policy({
      quorum: 3,
      holder: holder.publicKey,
      approver1: a1.publicKey,
      approver2: a2.publicKey,
      approver3: a3.publicKey
    })
    const fields = encodePolicyFields(book)
    fields[12] = Array.from(new TextEncoder().encode('1'))
    expect(parseCoverFields(fields)).toBeNull()
    const filed = await signClaim(holder.wallet, claimDraft(book))
    const approvals = await Promise.all([a1, a2, a3].map((who, index) => signApproval(who.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      signer: who.publicKey,
      approvedAt: `2026-09-29T16:0${index}:00Z`
    })))
    const opened = await signRelease(a3.wallet, {
      policyId: book.policyId,
      claimId: filed.claimId,
      payoutSats: filed.payoutSats,
      claimAdminFeeSats: CLAIM_ADMIN_FEE_SATS,
      releaser: a3.publicKey,
      releasedAt: '2026-09-29T18:00:00Z'
    })
    expect(admitRelease(book, filed, approvals.slice(0, 2), opened)).toBeNull()
    expect(admitRelease(book, filed, approvals, opened)).toEqual(opened)
    const late = await signClaim(holder.wallet, claimDraft(book, { filedAt: '2027-12-01T00:00:00Z' }))
    expect(foldClaims(book, [late], [], [])).toHaveLength(0)
  })

  it('keeps the earliest policy when a later record reuses the id', () => {
    const book = policy()
    const later = {
      ...book,
      subject: 'Forged fair',
      boughtAt: '2026-12-01T00:00:00Z'
    }
    expect(parseCoverFields(encodePolicyFields(book))).toEqual(book)
    const tampered = encodePolicyFields(book)
    tampered[5] = Array.from(new TextEncoder().encode('Forged fair'))
    expect(parseCoverFields(tampered)).toBeNull()
    const kept = listPolicies([later, book])
    expect(kept).toHaveLength(1)
    expect(kept[0]?.subject).toBe('Spring fair')
    expect(kept[0]?.boughtAt).toBe(WHEN)
  })

  it('builds a stranger reading without a wallet field', async () => {
    const holder = await party()
    const book = policy({ holder: holder.publicKey })
    const filed = await signClaim(holder.wallet, claimDraft(book))
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
