import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  ATTEST_SATS,
  BASKET,
  CLAIM_ADMIN_FEE_SATS,
  PROTOCOL_ID,
  approverKeys,
  assertSubject,
  buildReading,
  encodeApprovalFields,
  encodeClaimFields,
  encodePolicyFields,
  encodeReleaseFields,
  endsAtFrom,
  hashEvidenceFile,
  isApprover,
  isCoverKind,
  isDesk,
  isEvidenceHash,
  isHolder,
  isIdentityKey,
  makeClaimId,
  newPolicyId,
  nowIso,
  parseInsured,
  parseQuorum,
  parseTermDays,
  quoteCover,
  readingSlug,
  sameIdentity,
  type CoverKind,
  type CoverReading,
  type FoldedClaim,
  type PolicyRecord
} from '../../../protocol/cover'
import { originator } from './config'
import {
  ALREADY_APPROVED,
  ALREADY_CLAIMED,
  ALREADY_RELEASED,
  NEED_APPROVERS,
  NEED_EVIDENCE,
  NEED_QUORUM,
  NOT_APPROVER,
  NOT_HOLDER,
  NOT_RELEASER,
  TERM_ENDED
} from './copy'
import { nudgeCover } from './messagebox'
import { submitCoverTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface BuyInput {
  coverKind: string
  subject: string
  insured: string
  termDays: string
  quorum: string
  approver1: string
  approver2: string
  approver3: string
  desk: string
}

export interface PreparedBuy {
  coverKind: CoverKind
  subject: string
  insuredSats: number
  termDays: number
  quorum: number
  approver1: string
  approver2: string
  approver3: string
  desk: string
  premiumSats: number
  premiumCutSats: number
  netPremiumSats: number
}

export interface FileInput {
  evidenceHash: string
  payout: string
}

export interface BuyResult {
  policyId: string
  txid: string
  premiumSats: number
  premiumCutSats: number
  overlayError?: string
}

export interface ClaimResult {
  policyId: string
  claimId: string
  txid: string
  overlayError?: string
}

export interface ReleaseResult {
  policyId: string
  claimId: string
  txid: string
  payoutSats: number
  claimAdminFeeSats: number
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function randomNonce(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toHex(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function parsePayout(value: string, insuredSats: number): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!trimmed) return insuredSats
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > insuredSats) return null
  return parsed
}

export function assertCanBuy(input: BuyInput, holder: string): PreparedBuy {
  if (!isCoverKind(input.coverKind)) throw new Error('Pick a cover kind.')
  const subject = assertSubject(input.subject)
  const insuredSats = parseInsured(input.insured)
  if (insuredSats === null) throw new Error('Insured amount must be a whole number of sats.')
  const termDays = parseTermDays(input.termDays)
  if (termDays === null) throw new Error('Term must be between 1 and 365 days.')
  const quorum = parseQuorum(input.quorum)
  if (quorum === null) throw new Error('Approvals needed must be 1, 2, or 3.')
  const approvers = [input.approver1, input.approver2, input.approver3].map((key) => key.trim())
  if (approvers.some((key) => !isIdentityKey(key))) throw new Error(NEED_APPROVERS)
  if (new Set(approvers.map((key) => key.toLowerCase())).size !== 3) throw new Error(NEED_APPROVERS)
  const desk = input.desk.trim() || holder
  if (!isIdentityKey(desk)) throw new Error('Desk key must be an identity key, or leave it blank.')
  if (!isIdentityKey(holder)) throw new Error('Holder identity is missing.')
  const quote = quoteCover(input.coverKind, insuredSats, termDays)
  return {
    coverKind: input.coverKind,
    subject,
    insuredSats,
    termDays,
    quorum,
    approver1: approvers[0] ?? '',
    approver2: approvers[1] ?? '',
    approver3: approvers[2] ?? '',
    desk,
    ...quote
  }
}

export function assertCanFile(
  policy: PolicyRecord,
  claims: FoldedClaim[],
  identityKey: string,
  input: FileInput,
  filedAt = nowIso()
): { evidenceHash: string, payoutSats: number, filedAt: string } {
  if (!isHolder(policy, identityKey)) throw new Error(NOT_HOLDER)
  if (claims.length > 0) throw new Error(ALREADY_CLAIMED)
  if (filedAt > policy.endsAt) throw new Error(TERM_ENDED)
  const evidenceHash = input.evidenceHash.trim().toLowerCase()
  if (!isEvidenceHash(evidenceHash)) throw new Error(NEED_EVIDENCE)
  const payoutSats = parsePayout(input.payout, policy.insuredSats)
  if (payoutSats === null) throw new Error('Payout can’t be more than the insured amount.')
  return { evidenceHash, payoutSats, filedAt }
}

export function assertCanApprove(
  policy: PolicyRecord,
  folded: FoldedClaim,
  identityKey: string
): void {
  if (folded.release) throw new Error(ALREADY_RELEASED)
  if (!isApprover(policy, identityKey)) throw new Error(NOT_APPROVER)
  if (folded.approvals.some((row) => sameIdentity(row.signer, identityKey))) {
    throw new Error(ALREADY_APPROVED)
  }
}

export function assertCanRelease(
  policy: PolicyRecord,
  folded: FoldedClaim,
  identityKey: string
): { payoutSats: number, claimAdminFeeSats: number } {
  if (folded.release) throw new Error(ALREADY_RELEASED)
  if (!folded.quorumMet) throw new Error(NEED_QUORUM)
  const approved = folded.approvals.some((row) => sameIdentity(row.signer, identityKey))
  if (!approved && !isDesk(policy, identityKey)) throw new Error(NOT_RELEASER)
  return {
    payoutSats: folded.claim.payoutSats,
    claimAdminFeeSats: CLAIM_ADMIN_FEE_SATS
  }
}

export async function hashPickedFile(file: File): Promise<string> {
  if (file.size > 2_000_000) throw new Error('That file is too large to hash here.')
  const bytes = new Uint8Array(await file.arrayBuffer())
  return hashEvidenceFile(bytes)
}

async function finishAction(
  wallet: WalletClient,
  response: Awaited<ReturnType<WalletClient['createAction']>>
): Promise<{ txid: string, tx: number[] }> {
  let txid = response.txid
  let tx = response.tx as number[] | undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
    tx = signed.tx as number[] | undefined
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a transaction'), { cause: response })
  }
  return { txid, tx }
}

async function overlayOrError(overlayUrl: string, tx: number[]): Promise<string | undefined> {
  try {
    await submitCoverTx(overlayUrl, tx)
    return undefined
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return detail.trim() || 'overlay submit failed with no message'
  }
}

export async function buyCover(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: BuyInput
): Promise<BuyResult> {
  const ready = assertCanBuy(input, identityKey)
  const boughtAt = nowIso()
  const policyId = newPolicyId()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodePolicyFields({
        policyId,
        coverKind: ready.coverKind,
        subject: ready.subject,
        holder: identityKey,
        desk: ready.desk,
        insuredSats: ready.insuredSats,
        termDays: ready.termDays,
        premiumSats: ready.premiumSats,
        premiumCutSats: ready.premiumCutSats,
        quorum: ready.quorum,
        approver1: ready.approver1,
        approver2: ready.approver2,
        approver3: ready.approver3,
        boughtAt,
        endsAt: endsAtFrom(boughtAt, ready.termDays)
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Buy cover: ${ready.subject}`,
    outputs: [
      {
        satoshis: ready.premiumCutSats,
        lockingScript: p2pkhFromPublicKey(ready.desk),
        outputDescription: `Premium cut (desk fee) for ${ready.subject}`
      },
      {
        satoshis: ready.netPremiumSats,
        lockingScript: p2pkhFromPublicKey(ready.desk),
        outputDescription: `Cover premium for ${ready.subject}`
      },
      {
        satoshis: ATTEST_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Policy for ${ready.subject}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          policyId
        }),
        tags: [BASKET, 'policy', policyId]
      }
    ],
    labels: [BASKET, 'policy'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  void nudgeCover(wallet, identityKey, [ready.desk, ready.approver1, ready.approver2, ready.approver3], {
    kind: 'policy',
    policyId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return {
    policyId,
    txid,
    premiumSats: ready.premiumSats,
    premiumCutSats: ready.premiumCutSats,
    overlayError
  }
}

export async function fileClaim(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  policy: PolicyRecord,
  claims: FoldedClaim[],
  input: FileInput
): Promise<ClaimResult> {
  const ready = assertCanFile(policy, claims, identityKey, input)
  const claimId = makeClaimId(policy.policyId, identityKey, ready.evidenceHash, ready.filedAt, randomNonce())
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeClaimFields({
        policyId: policy.policyId,
        claimId,
        holder: identityKey,
        evidenceHash: ready.evidenceHash,
        payoutSats: ready.payoutSats,
        filedAt: ready.filedAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `File claim: ${policy.subject}`,
    outputs: [{
      satoshis: ATTEST_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Claim for ${policy.subject}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        policyId: policy.policyId,
        claimId
      }),
      tags: [BASKET, 'claim', policy.policyId]
    }],
    labels: [BASKET, 'claim'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  void nudgeCover(wallet, identityKey, [policy.desk, ...approverKeys(policy)], {
    kind: 'claim',
    policyId: policy.policyId,
    claimId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return { policyId: policy.policyId, claimId, txid, overlayError }
}

export async function approveClaim(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  policy: PolicyRecord,
  folded: FoldedClaim
): Promise<ClaimResult> {
  assertCanApprove(policy, folded, identityKey)
  const approvedAt = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeApprovalFields({
        policyId: policy.policyId,
        claimId: folded.claim.claimId,
        signer: identityKey,
        approvedAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Approve claim: ${policy.subject}`,
    outputs: [{
      satoshis: ATTEST_SATS,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Approval for ${policy.subject}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        policyId: policy.policyId,
        claimId: folded.claim.claimId
      }),
      tags: [BASKET, 'approval', policy.policyId]
    }],
    labels: [BASKET, 'approval'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  void nudgeCover(wallet, identityKey, [policy.holder, policy.desk, ...approverKeys(policy)], {
    kind: 'approval',
    policyId: policy.policyId,
    claimId: folded.claim.claimId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return { policyId: policy.policyId, claimId: folded.claim.claimId, txid, overlayError }
}

export async function releaseClaim(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  policy: PolicyRecord,
  folded: FoldedClaim
): Promise<ReleaseResult> {
  const ready = assertCanRelease(policy, folded, identityKey)
  const releasedAt = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeReleaseFields({
        policyId: policy.policyId,
        claimId: folded.claim.claimId,
        payoutSats: ready.payoutSats,
        claimAdminFeeSats: ready.claimAdminFeeSats,
        releaser: identityKey,
        releasedAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Release claim: ${policy.subject}`,
    outputs: [
      {
        satoshis: ready.claimAdminFeeSats,
        lockingScript: p2pkhFromPublicKey(policy.desk),
        outputDescription: `Claim-admin fee for ${policy.subject}`
      },
      {
        satoshis: ATTEST_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Released ${policy.subject}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          policyId: policy.policyId,
          claimId: folded.claim.claimId
        }),
        tags: [BASKET, 'release', policy.policyId]
      }
    ],
    labels: [BASKET, 'release'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  void nudgeCover(wallet, identityKey, [policy.holder, policy.desk, ...approverKeys(policy)], {
    kind: 'release',
    policyId: policy.policyId,
    claimId: folded.claim.claimId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return {
    policyId: policy.policyId,
    claimId: folded.claim.claimId,
    txid,
    payoutSats: ready.payoutSats,
    claimAdminFeeSats: ready.claimAdminFeeSats,
    overlayError
  }
}

export function downloadReading(policy: PolicyRecord, claims: FoldedClaim[]): CoverReading {
  const reading = buildReading(policy, claims, nowIso())
  const body = JSON.stringify(reading, null, 2)
  const blob = new Blob([body], { type: 'application/json' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `${readingSlug(policy.subject)}-cover.json`
  link.click()
  URL.revokeObjectURL(href)
  return reading
}
