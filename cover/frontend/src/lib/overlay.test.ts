import { PrivateKey, ProtoWallet } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  CLAIM_ADMIN_FEE_SATS,
  MAGIC,
  PROTOCOL_ID,
  SIGNING_KEY_ID,
  bytesToHex,
  canonicalClaimBytes,
  endsAtFrom,
  hashEvidenceText,
  makeClaimId,
  policyBindingId,
  quoteCover
} from '../../../protocol/cover'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import { overlayLookupService, overlayTopic, viewFromItems, type OverlayItem } from './overlay'

const HOLDER = `02${'ab'.repeat(32)}`
const DESK = `03${'cd'.repeat(32)}`
const A1 = `02${'11'.repeat(32)}`
const A2 = `03${'22'.repeat(32)}`
const A3 = `02${'33'.repeat(32)}`
const POLICY_ID = 'a'.repeat(32)
const WHEN = '2026-09-29T12:00:00Z'

function policyItem(): OverlayItem {
  const quote = quoteCover('event', 100_000, 30)
  return {
    payload: {
      magic: MAGIC,
      version: '1',
      kind: 'policy',
      policyId: POLICY_ID,
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
    },
    txid: '11'.repeat(32),
    outputIndex: 0
  }
}

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('https://example.com')).toBe('tm_anytx')
  })

  it('does not invent a custom topic on localhost', () => {
    expect(overlayTopic('http://localhost:5186')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://[::1]:8080')).toBe('tm_anytx')
  })
})

describe('client MAGIC filter', () => {
  it('folds one policy and ignores another desk', async () => {
    const wallet = new ProtoWallet(PrivateKey.fromRandom())
    const { publicKey: holderKey } = await wallet.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: SIGNING_KEY_ID,
      counterparty: 'self'
    })
    const evidenceHash = hashEvidenceText('cancelled')
    const filedAt = '2026-09-29T15:00:00Z'
    const quote = quoteCover('event', 100_000, 30)
    const body = {
      coverKind: 'event' as const,
      subject: 'Spring fair',
      holder: holderKey,
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
    const policyId = policyBindingId(body)
    const claimId = makeClaimId(policyId, holderKey, evidenceHash, filedAt, 'aa')
    const { signature } = await wallet.createSignature({
      data: canonicalClaimBytes({
        policyId,
        claimId,
        holder: holderKey,
        evidenceHash,
        payoutSats: 100_000,
        filedAt
      }),
      protocolID: PROTOCOL_ID,
      keyID: SIGNING_KEY_ID,
      counterparty: 'self'
    })
    const signedPolicy = {
      ...policyItem(),
      payload: {
        ...policyItem().payload,
        ...body,
        policyId
      }
    }
    const foreign = {
      ...policyItem(),
      payload: { ...policyItem().payload, magic: 'registry' },
      txid: '22'.repeat(32)
    } as OverlayItem
    const view = viewFromItems([
      signedPolicy,
      foreign,
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'claim',
          policyId,
          claimId,
          holder: holderKey,
          evidenceHash,
          payoutSats: 100_000,
          filedAt,
          signature: bytesToHex(signature)
        },
        txid: '33'.repeat(32),
        outputIndex: 1
      },
      {
        payload: {
          magic: MAGIC,
          version: '1',
          kind: 'release',
          policyId,
          claimId,
          payoutSats: 100_000,
          claimAdminFeeSats: CLAIM_ADMIN_FEE_SATS,
          releaser: A1,
          releasedAt: '2026-09-29T18:00:00Z'
        },
        txid: '44'.repeat(32),
        outputIndex: 0
      }
    ], policyId)
    expect(view.policy?.subject).toBe('Spring fair')
    expect(view.policy?.premiumCutSats).toBe(300)
    expect(view.claims).toHaveLength(1)
    expect(view.claims[0]?.status).toBe('filed')
    expect(view.claims[0]?.release).toBeNull()
  })
})
