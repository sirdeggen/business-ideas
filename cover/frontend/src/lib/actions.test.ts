import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  CLAIM_ADMIN_FEE_SATS,
  endsAtFrom,
  hashEvidenceText,
  quoteCover,
  type FoldedClaim,
  type PolicyRecord
} from '../../../protocol/cover'
import { assertCanApprove, assertCanBuy, assertCanFile, assertCanRelease } from './actions'
import { ALREADY_APPROVED, NEED_APPROVERS, NEED_QUORUM, NOT_HOLDER } from './copy'

const here = dirname(fileURLToPath(import.meta.url))
const actionsSrc = readFileSync(join(here, 'actions.ts'), 'utf8')

const HOLDER = `02${'ab'.repeat(32)}`
const DESK = `03${'cd'.repeat(32)}`
const A1 = `02${'11'.repeat(32)}`
const A2 = `03${'22'.repeat(32)}`
const A3 = `02${'33'.repeat(32)}`
const WHEN = '2026-09-29T12:00:00Z'

function book(): PolicyRecord {
  const quote = quoteCover('event', 100_000, 30)
  return {
    magic: 'cover',
    version: '1',
    kind: 'policy',
    policyId: 'a'.repeat(32),
    coverKind: 'event',
    subject: 'Spring fair',
    holder: HOLDER,
    desk: DESK,
    insuredSats: 100_000,
    termDays: 30,
    premiumSats: quote.premiumSats,
    premiumCutSats: quote.premiumCutSats,
    quorum: 2,
    approver1: A1,
    approver2: A2,
    approver3: A3,
    boughtAt: WHEN,
    endsAt: endsAtFrom(WHEN, 30)
  }
}

const input = {
  coverKind: 'event',
  subject: ' Spring fair ',
  insured: '100000',
  termDays: '30',
  quorum: '2',
  approver1: A1,
  approver2: A2,
  approver3: A3,
  desk: ''
}

describe('buy / claim / release gates', () => {
  it('quotes the premium cut before a wallet is required', () => {
    const ready = assertCanBuy(input, HOLDER)
    expect(ready.subject).toBe('Spring fair')
    expect(ready.desk).toBe(HOLDER)
    expect(ready.premiumSats).toBe(3_000)
    expect(ready.premiumCutSats).toBe(300)
    expect(ready.netPremiumSats).toBe(2_700)
  })

  it('rejects three approvers that are not distinct', () => {
    expect(() => assertCanBuy({ ...input, approver3: A1 }, HOLDER)).toThrow(NEED_APPROVERS)
    expect(() => assertCanBuy({ ...input, approver1: '' }, HOLDER)).toThrow(NEED_APPROVERS)
    expect(() => assertCanBuy({ ...input, approver1: HOLDER }, HOLDER)).toThrow(/holder/i)
    expect(() => assertCanBuy({ ...input, quorum: '1' }, HOLDER)).toThrow(/2 or 3/)
  })

  it('lets only the holder file, and release only after quorum', () => {
    const policy = book()
    expect(() => assertCanFile(policy, [], DESK, {
      evidenceHash: hashEvidenceText('cancelled'),
      payout: ''
    }, '2026-09-29T15:00:00Z')).toThrow(NOT_HOLDER)

    const filed = assertCanFile(policy, [], HOLDER, {
      evidenceHash: hashEvidenceText('cancelled'),
      payout: '50000'
    }, '2026-09-29T15:00:00Z')
    expect(filed.payoutSats).toBe(50_000)

    const folded: FoldedClaim = {
      claim: {
        magic: 'cover',
        version: '1',
        kind: 'claim',
        policyId: policy.policyId,
        claimId: 'b'.repeat(64),
        holder: HOLDER,
        evidenceHash: filed.evidenceHash,
        payoutSats: filed.payoutSats,
        filedAt: filed.filedAt,
        signature: 'aa'
      },
      approvals: [],
      release: null,
      approvalCount: 0,
      quorumMet: false,
      status: 'filed'
    }
    expect(() => assertCanRelease(policy, folded, A1)).toThrow(NEED_QUORUM)
    const agreed: FoldedClaim = {
      ...folded,
      approvalCount: 2,
      quorumMet: true,
      approvals: [
        {
          magic: 'cover',
          version: '1',
          kind: 'approval',
          policyId: policy.policyId,
          claimId: folded.claim.claimId,
          signer: A1,
          approvedAt: '2026-09-29T16:00:00Z',
          signature: 'aa'
        },
        {
          magic: 'cover',
          version: '1',
          kind: 'approval',
          policyId: policy.policyId,
          claimId: folded.claim.claimId,
          signer: A2,
          approvedAt: '2026-09-29T17:00:00Z',
          signature: 'bb'
        }
      ]
    }
    expect(() => assertCanRelease(policy, agreed, DESK)).toThrow()
    expect(assertCanRelease(policy, agreed, A1)).toEqual({
      payoutSats: 50_000,
      claimAdminFeeSats: CLAIM_ADMIN_FEE_SATS
    })
    assertCanApprove(policy, agreed, A3)
    expect(() => assertCanApprove(policy, agreed, A1)).toThrow(ALREADY_APPROVED)
  })

  it('labels the premium cut and the claim-admin fee in the wallet outputs', () => {
    expect(actionsSrc).toContain('Premium cut (desk fee)')
    expect(actionsSrc).toContain('Claim-admin fee')
    expect(actionsSrc).toContain('EVIDENCE_FILE_MAX')
    expect(actionsSrc).toContain('createSignature')
    expect(actionsSrc).not.toMatch(/USDC|x402|ETH|Solana|Lightning/i)
  })
})
