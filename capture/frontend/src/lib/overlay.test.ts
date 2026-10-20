import { LockingScript, MerklePath, PrivateKey, ProtoWallet, Transaction, UnlockingScript, Utils } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  PROTOCOL_ID,
  boundRequestId,
  escrowKeyId,
  escrowLockingKey,
  hashCapture,
  postRequest,
  proofInclusion,
  refundCapture,
  refundMessage,
  requestMessage,
  submitCapture,
  type CaptureRequest
} from '../../../protocol/capture'
import { PUBLIC_LOOKUP, PUBLIC_OVERLAY_URL, PUBLIC_TOPIC } from './config'
import {
  boardFromItems,
  decodeOverlayBeef,
  fetchBlockHeader,
  overlayLookupService,
  overlayTopic,
  verifiedHeaders,
  viewFromItems,
  type HeaderClient,
  type OverlayItem
} from './overlay'

const ID = 'ab'.repeat(32)
const KEY = `02${'cd'.repeat(32)}`

describe('overlay topic rails', () => {
  it('uses tm_anytx / ls_anytx on the public host and on localhost', () => {
    expect(overlayTopic(PUBLIC_OVERLAY_URL)).toBe('tm_anytx')
    expect(overlayTopic('https://overlay-us-1.bsvb.tech/')).toBe(PUBLIC_TOPIC)
    expect(overlayLookupService(PUBLIC_OVERLAY_URL)).toBe(PUBLIC_LOOKUP)
    expect(overlayTopic('http://localhost:5191')).toBe('tm_anytx')
    expect(overlayLookupService('http://127.0.0.1:8080')).toBe('ls_anytx')
    expect(overlayTopic('http://localhost:5191')).not.toBe('tm_capture')
    expect(overlayLookupService('http://localhost:5191')).not.toBe('ls_capture')
  })
})

describe('client MAGIC filter', () => {
  it('keeps only capture requests when the rows are not yet signed', async () => {
    const desk = submitCapture(postRequest({
      location: '12 Market Street',
      brief: 'Film the awning.',
      rewardSats: 100_000,
      processingFeeSats: 1_000,
      deadline: '2026-10-21T18:00:00Z',
      postedAt: '2026-10-20T12:00:00Z',
      nonce: '11'.repeat(16)
    }), {
      contributorIdentity: KEY,
      receiptHash: hashCapture('sealed-file'),
      capturedAt: '2026-10-20T12:00:00Z',
      geohash: 'u4pru',
      submittedAt: '2026-10-20T12:00:00Z'
    })
    const foreign = {
      payload: { ...desk.request!, magic: 'bounty' },
      txid: '11'.repeat(32),
      outputIndex: 0
    } as unknown as OverlayItem
    const items: OverlayItem[] = [
      { payload: desk.request!, txid: 'aa'.repeat(32), outputIndex: 0 },
      { payload: desk.pendingSubmissions[0]!, txid: 'aa'.repeat(32), outputIndex: 1 },
      foreign
    ]
    expect(items[0]?.payload.magic).toBe(MAGIC)
    expect(await boardFromItems(items)).toEqual([])
    expect(await viewFromItems([foreign], ID)).toBeNull()
    expect(JSON.stringify(await boardFromItems(items))).not.toContain('sealed-file')
  })
})

const WHEN = '2026-10-20T12:00:00Z'
const DEADLINE = '2026-10-21T12:00:00Z'
const AFTER = '2026-10-22T00:00:00Z'
const NONCE = '11'.repeat(16)

async function requesterSigner() {
  const key = PrivateKey.fromRandom()
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
  return { publicKey, lockingKey: derived.publicKey.toLowerCase(), sign }
}

async function signedRequest(request: CaptureRequest, sign: (message: number[]) => Promise<string>): Promise<CaptureRequest> {
  return { ...request, signature: await sign(requestMessage({ ...request, signature: '' })) }
}

describe('verified block headers', () => {
  it('reads a mainnet header into height, time, and merkle root', async () => {
    const root = 'ab'.repeat(32)
    const header = await fetchBlockHeader(800000, async (url) => {
      expect(url).toBe('https://api.whatsonchain.com/v1/bsv/main/block/800000/header')
      return new Response(JSON.stringify({ merkleroot: root.toUpperCase(), time: 1_700_000_000 }))
    })
    expect(header).toEqual({ height: 800000, time: 1_700_000_000, merkleRoot: root })
  })

  it('resolves a proven refund through the header client, not an injected clock', async () => {
    const requester = await requesterSigner()
    const request = await signedRequest(postRequest({
      location: '12 Market Street storefront',
      brief: 'Film the awning.',
      rewardSats: 100_000,
      processingFeeSats: 1_000,
      deadline: DEADLINE,
      requesterIdentity: requester.publicKey,
      nonce: NONCE,
      postedAt: WHEN
    }).request!, requester.sign)
    const drafted = refundCapture({ ...postRequest({
      location: request.location,
      brief: request.brief,
      rewardSats: request.rewardSats,
      processingFeeSats: request.processingFeeSats,
      deadline: request.deadline,
      requesterIdentity: request.requesterIdentity,
      nonce: request.nonce,
      postedAt: request.postedAt
    }), request }, AFTER)
    const refund = { ...drafted.pendingRefund!, signature: '' }
    refund.signature = await requester.sign(refundMessage(refund))
    const fundTx = 'aa'.repeat(32)
    const refundTx = 'bb'.repeat(32)
    const proof = MerklePath.fromCoinbaseTxidAndHeight(refundTx, 800000)
    const inclusion = proofInclusion(refundTx, proof)
    expect(inclusion?.merkleRoot).toBe(refundTx)
    const items: OverlayItem[] = [
      {
        payload: request,
        txid: fundTx,
        outputIndex: 0,
        lockingPublicKey: escrowLockingKey(request.requesterIdentity, request.requestId)
      },
      {
        payload: refund,
        txid: refundTx,
        outputIndex: 0,
        inputs: [`${fundTx}.0`],
        lockingPublicKey: requester.lockingKey,
        blockHeight: inclusion?.blockHeight,
        merkleRoot: inclusion?.merkleRoot,
        blockIndex: inclusion?.blockIndex
      }
    ]
    const time = Date.parse(AFTER) / 1000
    let checks = 0
    const matching: HeaderClient = {
      loadHeader: async (height) => {
        expect(height).toBe(800000)
        return { height, time, merkleRoot: inclusion?.merkleRoot ?? '' }
      },
      tracker: {
        isValidRootForHeight: async (root, height) => {
          checks += 1
          expect(root).toBe(inclusion?.merkleRoot)
          expect(height).toBe(800000)
          return true
        }
      }
    }
    const counted = await boardFromItems(items, null, [], matching)
    expect(checks).toBe(1)
    expect(counted[0]?.status).toBe('refunded')
    expect(counted[0]?.refund?.refundSats).toBe(100_000)
    expect(counted[0]?.pendingRefund).toBeNull()
    const mismatch: HeaderClient = {
      loadHeader: async () => ({ height: 800000, time, merkleRoot: 'cd'.repeat(32) }),
      tracker: { isValidRootForHeight: async () => true }
    }
    const forged = await boardFromItems(items, null, [], mismatch)
    expect(forged[0]?.status).toBe('pending')
    expect(forged[0]?.refund).toBeNull()
    const rejected: HeaderClient = {
      loadHeader: async () => ({ height: 800000, time, merkleRoot: inclusion?.merkleRoot ?? '' }),
      tracker: { isValidRootForHeight: async () => false }
    }
    const unconfirmed = await boardFromItems(items, null, [], rejected)
    expect(unconfirmed[0]?.status).toBe('pending')
    expect(unconfirmed[0]?.refund).toBeNull()
    const headers = await verifiedHeaders(items.map((item) => ({
      txid: item.txid,
      vout: item.outputIndex,
      inputs: item.inputs ?? [],
      lockingPublicKey: item.lockingPublicKey ?? '',
      payload: item.payload,
      blockHeight: item.blockHeight,
      merkleRoot: item.merkleRoot,
      blockIndex: item.blockIndex
    })), matching)
    expect(headers).toEqual([{ height: 800000, time, merkleRoot: refundTx }])
  })

  it('shows an escrow spent by a transaction with no capture record as spent', async () => {
    const requester = await requesterSigner()
    const request = await signedRequest(postRequest({
      location: '12 Market Street storefront',
      brief: 'Film the awning.',
      rewardSats: 100_000,
      processingFeeSats: 1_000,
      deadline: DEADLINE,
      requesterIdentity: requester.publicKey,
      nonce: NONCE,
      postedAt: WHEN
    }).request!, requester.sign)
    const fundTx = 'aa'.repeat(32)
    const items: OverlayItem[] = [{
      payload: request,
      txid: fundTx,
      outputIndex: 0,
      lockingPublicKey: escrowLockingKey(request.requesterIdentity, request.requestId)
    }]
    const spent = await boardFromItems(items, null, [`${fundTx}.0`])
    expect(spent[0]?.status).toBe('spent')
    expect(spent[0]?.status).not.toBe('open')
    const tx = new Transaction()
    tx.addInput({
      sourceTXID: fundTx,
      sourceOutputIndex: 0,
      sequence: 0xffffffff,
      unlockingScript: new UnlockingScript()
    })
    tx.addOutput({
      satoshis: 1,
      lockingScript: LockingScript.fromHex('51')
    })
    const decoded = decodeOverlayBeef(tx.toBEEF())
    expect(decoded.items).toEqual([])
    expect(decoded.spentOutpoints).toContain(`${fundTx}.0`)
  })
})
