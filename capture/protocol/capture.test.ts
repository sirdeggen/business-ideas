import { MerklePath, PrivateKey, ProtoWallet, PushDrop, Utils } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  BRC29_PROTOCOL,
  CONTRIBUTOR_KEY_ID,
  CONTRIBUTOR_PAY_KEY_ID,
  DEADLINE_ENFORCEMENT,
  DESK_FEE_BPS,
  DESK_FEE_KEY,
  DESK_FEE_KEY_ID,
  MAGIC,
  PROTOCOL_ID,
  acceptCapture,
  acceptMessage,
  acceptPaysSplit,
  assertPayout,
  bindRequest,
  boardStats,
  bookFromRecords,
  boundRequestId,
  contributorPayoutKey,
  contributorSigningKey,
  deskFeeLockingKey,
  deskFeeSats,
  deskFromChain,
  deskFromRecords,
  derivedLockingKey,
  encodeAcceptFields,
  encodeRefundFields,
  encodeRequestFields,
  encodeSubmitFields,
  escrowKeyId,
  escrowLockingKey,
  feeOutputInstructions,
  hashCapture,
  keepMagic,
  parseCaptureFields,
  p2pkhLockingScript,
  payoutLines,
  postRequest,
  proofInclusion,
  trustedAt,
  refundCapture,
  refundMessage,
  requestLockedToRequester,
  requestMessage,
  sortBoard,
  submitCapture,
  submitMessage,
  type BlockHeaderTime,
  type CaptureAccept,
  type CaptureRefund,
  type CaptureRequest,
  type CaptureSubmit,
  type ChainOutput,
  type ChainRecord,
  type ListedRequest
} from './capture'

const NONCE = '11'.repeat(16)
const WHEN = '2026-10-20T12:00:00Z'
const DEADLINE = '2026-10-21T12:00:00Z'
const AFTER = '2026-10-21T12:00:01Z'
const BEFORE = '2026-10-21T11:59:59Z'
const FILE = 'RAW-FOOTAGE-SECRET-storefront-awning'
const PREVIEW = 'WATERMARKED-PREVIEW-do-not-chain'

function drafted(identity = '', nonce = NONCE) {
  return postRequest({
    location: '12 Market Street storefront',
    brief: 'Film the awning and the front window.',
    rewardSats: 100_000,
    processingFeeSats: 1_000,
    deadline: DEADLINE,
    requesterIdentity: identity,
    nonce,
    postedAt: WHEN
  })
}

async function signer(root?: PrivateKey) {
  const key = root ?? PrivateKey.fromRandom()
  const wallet = new ProtoWallet(key)
  const publicKey = key.toPublicKey().toString().toLowerCase()
  const requestId = boundRequestId(publicKey, NONCE)
  const keyID = escrowKeyId(requestId)
  const derived = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID,
    counterparty: 'anyone',
    forSelf: true
  })
  async function sign(message: number[]): Promise<string> {
    const { signature } = await wallet.createSignature({
      data: message,
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'anyone'
    })
    return Utils.toHex(signature)
  }
  async function signAsContributor(message: number[]): Promise<string> {
    const { signature } = await wallet.createSignature({
      data: message,
      protocolID: PROTOCOL_ID,
      keyID: CONTRIBUTOR_KEY_ID,
      counterparty: 'anyone'
    })
    return Utils.toHex(signature)
  }
  return { publicKey, lockingKey: derived.publicKey.toLowerCase(), wallet, keyID, requestId, sign, signAsContributor }
}

async function signedRequest(request: CaptureRequest, sign: (message: number[]) => Promise<string>): Promise<CaptureRequest> {
  return { ...request, signature: await sign(requestMessage({ ...request, signature: '' })) }
}

async function signedSubmit(submit: CaptureSubmit, sign: (message: number[]) => Promise<string>): Promise<CaptureSubmit> {
  return { ...submit, signature: await sign(submitMessage({ ...submit, signature: '' })) }
}

function chainRequest(request: CaptureRequest, txid: string, vout = 0): ChainRecord {
  return {
    txid,
    vout,
    inputs: [],
    lockingPublicKey: escrowLockingKey(request.requesterIdentity, request.requestId),
    payload: request
  }
}

const ROOT = 'ab'.repeat(32)

function withProof(record: ChainRecord, height: number, index = 0, root = ROOT): ChainRecord {
  return { ...record, blockHeight: height, blockIndex: index, merkleRoot: root }
}

function splitOutputs(contributor: string, reward = 100_000, processing = 1_000, contributorSats?: number, payee = contributorPayoutKey(contributor)): ChainOutput[] {
  const lines = payoutLines(reward, processing)
  return [
    { satoshis: contributorSats ?? lines.contributorSats, lockingScript: p2pkhLockingScript(payee) },
    { satoshis: lines.deskFeeSats, lockingScript: p2pkhLockingScript(deskFeeLockingKey()) },
    { satoshis: lines.processingFeeSats, lockingScript: p2pkhLockingScript(deskFeeLockingKey()) },
    { satoshis: 1, lockingScript: '51' }
  ]
}

describe('encode and decode', () => {
  it('round-trips request, submission, accept, and refund without the raw file', async () => {
    const requester = await signer()
    const contributor = await signer()
    const desk = submitCapture(drafted(requester.publicKey), {
      contributorIdentity: contributor.publicKey,
      receiptHash: hashCapture(FILE),
      capturedAt: WHEN,
      geohash: 'u4pru',
      submittedAt: WHEN
    })
    const accepted = acceptCapture(desk, hashCapture(FILE), '2026-10-20T18:00:00Z')
    const request = await signedRequest(accepted.request!, requester.sign)
    const submission = await signedSubmit(accepted.pendingSubmissions[0]!, contributor.signAsContributor)
    const accept = accepted.accept!
    accept.signature = await requester.sign(acceptMessage(accept))
    const parsedRequest = parseCaptureFields(encodeRequestFields(request))
    const parsedSubmit = parseCaptureFields(encodeSubmitFields(submission))
    const parsedAccept = parseCaptureFields(encodeAcceptFields(accept))
    expect(parsedRequest).toMatchObject({ kind: 'request', location: '12 Market Street storefront', rewardSats: 100_000 })
    expect(parsedSubmit).toMatchObject({ kind: 'submit', geohash: 'u4pru', receiptHash: hashCapture(FILE) })
    expect(parsedAccept).toMatchObject({ kind: 'accept', deskFeeSats: 10_000, processingFeeSats: 1_000, contributorSats: 89_000 })
    const encoded = [
      ...encodeRequestFields(request),
      ...encodeSubmitFields(submission),
      ...encodeAcceptFields(accept)
    ].map((field) => new TextDecoder().decode(Uint8Array.from(field))).join('\n')
    expect(encoded).not.toContain(FILE)
    expect(encoded).not.toContain(PREVIEW)
    expect(encoded).not.toContain('RAW-FOOTAGE')
  })

  it('drops a foreign magic and keeps capture rows', () => {
    const desk = drafted()
    const foreign = { ...desk.request!, magic: 'bounty' }
    const rows = keepMagic([desk.request!, foreign as unknown as CaptureRequest])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.magic).toBe(MAGIC)
    expect(MAGIC).toBe('capture')
    expect(parseCaptureFields([
      Array.from(new TextEncoder().encode('bounty')),
      Array.from(new TextEncoder().encode('1')),
      Array.from(new TextEncoder().encode('request'))
    ])).toBeNull()
  })
})

describe('fee floor', () => {
  it('floors the 10% desk fee and keeps the processing fee fixed', () => {
    expect(DESK_FEE_BPS).toBe(1_000)
    expect(deskFeeSats(10_001)).toBe(1_000)
    expect(deskFeeSats(10)).toBe(1)
    expect(deskFeeSats(9)).toBe(0)
    expect(payoutLines(10_001, 1_000)).toEqual({
      rewardSats: 10_001,
      deskFeeBps: 1_000,
      deskFeeSats: 1_000,
      processingFeeSats: 1_000,
      contributorSats: 8_001
    })
    expect(8_001 + 1_000 + 1_000).toBe(10_001)
    const low = payoutLines(100_000, 1_000)
    const high = payoutLines(100_000, 2_000)
    expect(low.deskFeeSats).toBe(10_000)
    expect(high.deskFeeSats).toBe(low.deskFeeSats)
    expect(low.contributorSats - high.contributorSats).toBe(1_000)
    expect(() => payoutLines(9, 1)).toThrow(/floor/)
    expect(() => payoutLines(100_000, 0)).toThrow(/processing fee/)
  })
})

describe('refund deadline', () => {
  it('refunds the full reward only after the deadline', () => {
    const desk = drafted('02' + 'ab'.repeat(32))
    expect(() => refundCapture(desk, BEFORE)).toThrow(/deadline has not passed/)
    expect(() => refundCapture(desk, WHEN)).toThrow(/deadline has not passed/)
    const refunded = refundCapture(desk, AFTER)
    expect(refunded.pendingRefund).toMatchObject({ refundSats: 100_000, refundedAt: AFTER })
    expect(refunded.refund).toBeNull()
    expect(refunded.pendingRefund?.refundSats).toBe(desk.request?.rewardSats)
    const onTime = refundCapture(desk, DEADLINE)
    expect(onTime.pendingRefund?.refundSats).toBe(100_000)
    expect(DEADLINE_ENFORCEMENT).toBe('header-time')
  })
})

describe('readers trust the requester key', () => {
  it('re-derives the escrow key from the public identity alone', async () => {
    const requester = await signer()
    expect(requester.keyID).toBe(`escrow-${requester.requestId}`)
    expect(requester.publicKey).not.toBe(requester.lockingKey)
    expect(escrowLockingKey(requester.publicKey, requester.requestId)).toBe(requester.lockingKey)
    const request = drafted(requester.publicKey).request!
    expect(request.requestId).toBe(boundRequestId(requester.publicKey, NONCE))
    const locking = await new PushDrop(requester.wallet).lock(
      encodeRequestFields(request),
      PROTOCOL_ID,
      requester.keyID,
      'anyone',
      true,
      false
    )
    const decoded = PushDrop.decode(locking)
    expect(decoded.lockingPublicKey.toString().toLowerCase()).toBe(requester.lockingKey)
    expect(requestLockedToRequester(decoded.lockingPublicKey.toString(), request)).toBe(true)
    expect(DESK_FEE_KEY).toBe('02c5313bc21f0a61418640c94a23d3cdb09ea50a8a3dd8daababe93f57a5fa0082')
    expect(deskFeeLockingKey()).not.toBe(DESK_FEE_KEY)
    const root = PrivateKey.fromRandom()
    const wallet = new ProtoWallet(root)
    const derived = await wallet.getPublicKey({
      protocolID: BRC29_PROTOCOL,
      keyID: DESK_FEE_KEY_ID,
      counterparty: 'anyone',
      forSelf: true
    })
    expect(derivedLockingKey(root.toPublicKey().toString(), BRC29_PROTOCOL, DESK_FEE_KEY_ID)).toBe(derived.publicKey)
    expect(DESK_FEE_KEY_ID).toBe('capture-fee')
    const instructions = JSON.parse(feeOutputInstructions()) as { keyID: string, counterparty: string }
    expect(instructions).toMatchObject({ keyID: 'capture-fee', counterparty: 'anyone' })
  })

  it('breaks a same-key tie by the oldest request and honors ?tx=', async () => {
    const requester = await signer()
    const honest = await signedRequest(drafted(requester.publicKey).request!, requester.sign)
    const later = await signedRequest({
      ...honest,
      location: 'Later roof',
      postedAt: '2026-10-20T15:00:00Z',
      signature: ''
    }, requester.sign)
    expect(deskFromRecords([later, honest])?.request?.location).toBe('12 Market Street storefront')
    const earlyTx = 'aa'.repeat(32)
    const lateTx = 'bb'.repeat(32)
    expect(deskFromChain([
      chainRequest(later, lateTx),
      chainRequest(honest, earlyTx)
    ])?.request?.postedAt).toBe(honest.postedAt)
    expect(deskFromChain([
      chainRequest(honest, earlyTx),
      chainRequest(later, lateTx)
    ], { hintTxid: lateTx })?.request?.location).toBe('Later roof')
    expect(deskFromChain([
      chainRequest(honest, earlyTx),
      chainRequest(later, lateTx)
    ], { hintTxid: 'cc'.repeat(32) })).toBeNull()
  })

  it('ignores an attacker who copies the request id and backdates the request', async () => {
    const requester = await signer()
    const attacker = await signer()
    const honest = await signedRequest(drafted(requester.publicKey).request!, requester.sign)
    const copied: CaptureRequest = {
      ...honest,
      requesterIdentity: attacker.publicKey,
      location: 'Forged roof',
      postedAt: '2020-01-01T00:00:00Z',
      signature: ''
    }
    expect(copied.requestId).toBe(honest.requestId)
    expect(boundRequestId(copied.requesterIdentity, copied.nonce)).not.toBe(copied.requestId)
    expect(deskFromRecords([copied, honest])?.request?.location).toBe('12 Market Street storefront')
    expect(deskFromChain([
      chainRequest(copied, 'bb'.repeat(32)),
      chainRequest(honest, 'aa'.repeat(32))
    ])?.request?.requesterIdentity).toBe(requester.publicKey)
    expect(bookFromRecords([copied, honest]).map((row) => row.request.location)).toEqual(['12 Market Street storefront'])
  })

  it('ignores a forged request that matches the key but is not signed by it', async () => {
    const requester = await signer()
    const attacker = await signer()
    const honest = await signedRequest(drafted(requester.publicKey).request!, requester.sign)
    const forged: CaptureRequest = {
      ...honest,
      location: 'Forged roof',
      postedAt: '2020-01-01T00:00:00Z',
      signature: ''
    }
    forged.signature = await attacker.sign(requestMessage(forged))
    expect(forged.requesterIdentity).toBe(honest.requesterIdentity)
    expect(forged.nonce).toBe(honest.nonce)
    expect(forged.requestId).toBe(boundRequestId(forged.requesterIdentity, forged.nonce))
    expect(forged.postedAt < honest.postedAt).toBe(true)
    const attack = chainRequest(forged, 'bb'.repeat(32))
    expect(attack.lockingPublicKey).toBe(escrowLockingKey(forged.requesterIdentity, forged.requestId))
    expect(deskFromChain([attack])).toBeNull()
    const kept = deskFromChain([attack, chainRequest(honest, 'aa'.repeat(32))])
    expect(kept?.request?.location).toBe('12 Market Street storefront')
    expect(kept?.request?.postedAt).toBe(honest.postedAt)
    expect(deskFromRecords([forged, { ...honest, signature: '' }])).toBeNull()
  })

  it('drops a forged accept and a payout to the wrong contributor', async () => {
    const requester = await signer()
    const contributor = await signer()
    const other = await signer()
    const request = await signedRequest(drafted(requester.publicKey).request!, requester.sign)
    const desk = submitCapture({ ...drafted(requester.publicKey), request }, {
      contributorIdentity: contributor.publicKey,
      receiptHash: hashCapture(FILE),
      capturedAt: WHEN,
      geohash: 'u4pru',
      submittedAt: WHEN
    })
    const submission = await signedSubmit(desk.pendingSubmissions[0]!, contributor.signAsContributor)
    const accepted = acceptCapture({ ...desk, submissions: [submission] }, hashCapture(FILE), '2026-10-20T18:00:00Z')
    const honest: CaptureAccept = {
      ...accepted.accept!,
      signature: await requester.sign(acceptMessage(accepted.accept!))
    }
    const forged: CaptureAccept = {
      ...honest,
      contributorSats: honest.contributorSats + 1,
      signature: ''
    }
    forged.signature = await other.sign(acceptMessage(forged))
    expect(deskFromRecords([request, submission, forged, { ...honest, signature: '' }])?.accept).toBeNull()
    const kept = deskFromRecords([request, submission, forged, honest])
    expect(kept?.accept).toBeNull()
    expect(kept?.pendingSubmissions.map((row) => row.receiptHash)).toContain(submission.receiptHash)
    const wrong: CaptureAccept = {
      ...honest,
      contributorIdentity: other.publicKey,
      signature: ''
    }
    wrong.signature = await requester.sign(acceptMessage(wrong))
    expect(deskFromRecords([request, submission, wrong])?.accept).toBeNull()
    expect(() => assertPayout(submission, contributorPayoutKey(other.publicKey))).toThrow(/contributor who signed/)
    expect(contributorPayoutKey(submission.contributorIdentity)).toBe(
      derivedLockingKey(contributor.publicKey, BRC29_PROTOCOL, CONTRIBUTOR_PAY_KEY_ID)
    )
    expect(assertPayout(submission, contributorPayoutKey(submission.contributorIdentity))).toBeUndefined()
    expect(contributorSigningKey(contributor.publicKey)).not.toBe(contributor.publicKey)
    const fundTx = 'aa'.repeat(32)
    const acceptTx = 'bb'.repeat(32)
    const forgedTx = 'cc'.repeat(32)
    const submitTx = 'dd'.repeat(32)
    const spent = `${fundTx}.0`
    const headers: BlockHeaderTime[] = [{ height: 800, time: Date.parse(WHEN) / 1000, merkleRoot: ROOT }]
    const onTimeSubmit = withProof({
      txid: submitTx,
      vout: 0,
      inputs: [],
      lockingPublicKey: contributorSigningKey(contributor.publicKey),
      payload: submission
    }, 800, 1)
    const honestSpend: ChainRecord = {
      txid: acceptTx,
      vout: 3,
      inputs: [spent],
      lockingPublicKey: requester.lockingKey,
      payload: honest,
      outputs: splitOutputs(contributor.publicKey)
    }
    expect(acceptPaysSplit(honestSpend, request, submission)).toBe(true)
    const folded = deskFromChain([
      chainRequest(request, fundTx),
      {
        txid: forgedTx,
        vout: 3,
        inputs: [spent],
        lockingPublicKey: requester.lockingKey,
        payload: forged,
        outputs: splitOutputs(contributor.publicKey)
      },
      honestSpend,
      onTimeSubmit
    ], { headers })
    expect(folded?.accept?.signature).toBe(honest.signature)
    expect(deskFromChain([
      chainRequest(request, fundTx),
      { txid: forgedTx, vout: 3, inputs: [`${'ff'.repeat(32)}.0`], lockingPublicKey: requester.lockingKey, payload: honest, outputs: splitOutputs(contributor.publicKey) },
      onTimeSubmit
    ], { headers })?.accept).toBeNull()
    const wrongAmount: ChainRecord = { ...honestSpend, txid: 'ee'.repeat(32), outputs: splitOutputs(contributor.publicKey, 100_000, 1_000, 80_000) }
    expect(deskFromChain([
      chainRequest(request, fundTx),
      onTimeSubmit,
      wrongAmount
    ], { headers })?.accept).toBeNull()
    const wrongPayee: ChainRecord = {
      ...honestSpend,
      txid: 'ab'.repeat(32),
      outputs: splitOutputs(contributor.publicKey, 100_000, 1_000, undefined, contributorPayoutKey(other.publicKey))
    }
    expect(deskFromChain([
      chainRequest(request, fundTx),
      onTimeSubmit,
      wrongPayee
    ], { headers })?.accept).toBeNull()
    expect(deskFromChain([
      chainRequest(request, fundTx),
      onTimeSubmit,
      honestSpend
    ])?.accept).toBeNull()
  })

  it('drops a refund dated before the deadline and keeps a full refund after it', async () => {
    const requester = await signer()
    const request = await signedRequest(drafted(requester.publicKey).request!, requester.sign)
    const earlyDesk = refundCapture({ ...drafted(requester.publicKey), request }, AFTER)
    const early: CaptureRefund = { ...earlyDesk.pendingRefund!, refundedAt: BEFORE, signature: '' }
    early.signature = await requester.sign(refundMessage(early))
    const unsigned = deskFromRecords([request, early])
    expect(unsigned?.refund).toBeNull()
    expect(unsigned?.pendingRefund?.refundedAt).toBe(BEFORE)
    const honest: CaptureRefund = { ...early, refundedAt: AFTER, refundSats: request.rewardSats, signature: '' }
    honest.signature = await requester.sign(refundMessage(honest))
    const kept = deskFromRecords([request, early, honest])
    expect(kept?.refund).toBeNull()
    expect(kept?.pendingRefund).not.toBeNull()
    const short: CaptureRefund = { ...honest, refundSats: request.rewardSats - 1, signature: '' }
    short.signature = await requester.sign(refundMessage(short))
    expect(deskFromRecords([request, short])?.refund).toBeNull()
    expect(deskFromRecords([request, short])?.pendingRefund).toBeNull()
    const fundTx = 'aa'.repeat(32)
    const refundTx = 'bb'.repeat(32)
    const spend: ChainRecord = {
      txid: refundTx,
      vout: 0,
      inputs: [`${fundTx}.0`],
      lockingPublicKey: requester.lockingKey,
      payload: honest,
      lockTime: 4_000_000_000,
      hostAssertedAt: AFTER
    }
    const empty = deskFromChain([chainRequest(request, fundTx), spend])
    expect(empty?.refund).toBeNull()
    expect(empty?.pendingRefund?.refundSats).toBe(100_000)
    const afterHeader: BlockHeaderTime[] = [{ height: 900, time: Date.parse(AFTER) / 1000, merkleRoot: ROOT }]
    const beforeHeader: BlockHeaderTime[] = [{ height: 900, time: Date.parse(BEFORE) / 1000, merkleRoot: ROOT }]
    expect(deskFromChain([
      chainRequest(request, fundTx),
      withProof(spend, 900)
    ], { headers: afterHeader })?.refund?.refundSats).toBe(100_000)
    const earlyChain = deskFromChain([
      chainRequest(request, fundTx),
      withProof(spend, 900)
    ], { headers: beforeHeader })
    expect(earlyChain?.refund).toBeNull()
    expect(earlyChain?.pendingRefund).toBeNull()
    expect(earlyChain?.earlyRefund?.refundSats).toBe(100_000)
    expect(trustedAt(withProof(spend, 900), [{ height: 900, time: Date.parse(AFTER) / 1000, merkleRoot: 'cd'.repeat(32) }])).toBeNull()
    expect(encodeRefundFields(honest)[2] && new TextDecoder().decode(Uint8Array.from(encodeRefundFields(honest)[2]!))).toBe('refund')
  })

  it('leaves an empty context pending and ignores a backdated capturedAt', async () => {
    const requester = await signer()
    const contributor = await signer()
    const request = await signedRequest(drafted(requester.publicKey).request!, requester.sign)
    const backdated = await signedSubmit(submitCapture({ ...drafted(requester.publicKey), request }, {
      contributorIdentity: contributor.publicKey,
      receiptHash: hashCapture('backdated-file'),
      capturedAt: '2020-01-01T00:00:00Z',
      geohash: 'u4pru',
      submittedAt: '2020-01-01T00:00:00Z'
    }).pendingSubmissions[0]!, contributor.signAsContributor)
    const later = await signedSubmit(submitCapture({ ...drafted(requester.publicKey), request }, {
      contributorIdentity: contributor.publicKey,
      receiptHash: hashCapture('later-file'),
      capturedAt: '2026-10-22T00:00:00Z',
      geohash: 'u4pru',
      submittedAt: '2026-10-22T00:00:00Z'
    }).pendingSubmissions[0]!, contributor.signAsContributor)
    const fundTx = 'aa'.repeat(32)
    const desk = deskFromChain([
      chainRequest(request, fundTx),
      {
        txid: 'ff'.repeat(32),
        vout: 0,
        inputs: [],
        lockingPublicKey: contributorSigningKey(contributor.publicKey),
        payload: backdated,
        hostAssertedAt: WHEN,
        lockTime: 1
      },
      {
        txid: '11'.repeat(32),
        vout: 0,
        inputs: [],
        lockingPublicKey: contributorSigningKey(contributor.publicKey),
        payload: later
      }
    ])
    expect(desk?.submissions).toEqual([])
    expect(desk?.lateSubmissions).toEqual([])
    expect(desk?.pendingSubmissions.map((row) => row.receiptHash)).toEqual([
      later.receiptHash,
      backdated.receiptHash
    ])
    expect(desk?.pendingSubmissions[1]?.hostAssertedAt).toBe(WHEN)
    expect(desk?.accept).toBeNull()
    const proof = MerklePath.fromCoinbaseTxidAndHeight('11'.repeat(32), 800000)
    const inclusion = proofInclusion('11'.repeat(32), proof)
    expect(inclusion?.blockHeight).toBe(800000)
    expect(inclusion?.merkleRoot).toBe('11'.repeat(32))
    const proved = deskFromChain([
      chainRequest(request, fundTx),
      {
        txid: '11'.repeat(32),
        vout: 0,
        inputs: [],
        lockingPublicKey: contributorSigningKey(contributor.publicKey),
        payload: later,
        blockHeight: inclusion?.blockHeight,
        merkleRoot: inclusion?.merkleRoot,
        blockIndex: inclusion?.blockIndex
      }
    ], { headers: [{ height: 800000, time: Date.parse('2026-10-22T00:00:00Z') / 1000, merkleRoot: inclusion?.merkleRoot ?? '' }] })
    expect(proved?.submissions).toEqual([])
    expect(proved?.lateSubmissions.map((row) => row.receiptHash)).toEqual([later.receiptHash])
    const tied = deskFromChain([
      chainRequest(request, fundTx),
      withProof({
        txid: 'ff'.repeat(32),
        vout: 0,
        inputs: [],
        lockingPublicKey: contributorSigningKey(contributor.publicKey),
        payload: backdated
      }, 800, 0),
      withProof({
        txid: '11'.repeat(32),
        vout: 0,
        inputs: [],
        lockingPublicKey: contributorSigningKey(contributor.publicKey),
        payload: later
      }, 800, 0)
    ], { headers: [{ height: 800, time: Date.parse(WHEN) / 1000, merkleRoot: ROOT }] })
    expect(tied?.submissions.map((row) => row.receiptHash)).toEqual([
      backdated.receiptHash,
      later.receiptHash
    ])
  })
})

describe('board order', () => {
  it('uses posted time only as a tie-break within the same key', async () => {
    const first = await signer()
    const second = await signer()
    const earlyOther = await signedRequest({
      ...drafted(second.publicKey).request!,
      postedAt: '2020-01-01T00:00:00Z',
      signature: ''
    }, second.sign)
    const laterRequest = drafted(first.publicKey, '22'.repeat(16)).request!
    const later = await signedRequest(laterRequest, async (message) => {
      const { signature } = await first.wallet.createSignature({
        data: message,
        protocolID: PROTOCOL_ID,
        keyID: escrowKeyId(laterRequest.requestId),
        counterparty: 'anyone'
      })
      return Utils.toHex(signature)
    })
    const earlierSame = await signedRequest({
      ...drafted(first.publicKey).request!,
      postedAt: '2026-10-20T08:00:00Z',
      signature: ''
    }, first.sign)
    const rows = bookFromRecords([earlyOther, later, earlierSame])
    const sameKey = rows.filter((row) => row.request.requesterIdentity === first.publicKey)
    expect(sameKey.map((row) => row.request.postedAt)).toEqual(['2026-10-20T08:00:00Z', WHEN])
    const ids = [earlyOther.requestId, later.requestId, earlierSame.requestId]
    const across = sortBoard(rows.filter((row) => row.request.requesterIdentity !== first.publicKey).concat(sameKey.slice(0, 1)))
    expect(across.map((row) => row.requestId)).toEqual([...new Set(across.map((row) => row.requestId))].sort())
    expect(ids).toContain(earlyOther.requestId)
    const stats = boardStats(rows)
    expect(stats).toMatchObject({ open: 3, accepted: 0, refunded: 0, acceptRate: 0, medianAcceptMs: null })
    const acceptedRow: ListedRequest = {
      ...rows[0]!,
      status: 'accepted',
      trustedPostedAt: '2026-10-20T12:00:00Z',
      trustedAcceptAt: '2026-10-20T18:00:00Z',
      accept: {
        magic: 'capture',
        version: '1',
        kind: 'accept',
        requestId: rows[0]!.requestId,
        receiptHash: 'ab'.repeat(32),
        contributorIdentity: second.publicKey,
        contributorSats: 1,
        deskFeeSats: 1,
        processingFeeSats: 1,
        acceptedAt: '2020-01-01T00:00:00Z',
        signature: 'abcd'
      }
    }
    const withAccept = boardStats([acceptedRow])
    expect(withAccept.accepted).toBe(1)
    expect(withAccept.acceptRate).toBe(100)
    expect(withAccept.medianAcceptMs).toBe(Date.parse('2026-10-20T18:00:00Z') - Date.parse('2026-10-20T12:00:00Z'))
    expect(boardStats([{ ...acceptedRow, trustedAcceptAt: null, trustedPostedAt: null }]).medianAcceptMs).toBeNull()
    expect(bindRequest(drafted().request!, first.publicKey).requestId).toBe(boundRequestId(first.publicKey, NONCE))
  })
})
