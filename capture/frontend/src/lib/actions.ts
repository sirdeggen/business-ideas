import { LockingScript, P2PKH, PublicKey, PushDrop, Utils, WalletClient, type AtomicBEEF, type CreateActionOutput, type CreateActionResult } from '@bsv/sdk'
import {
  BASKET,
  BRC29_PROTOCOL,
  CONTRIBUTOR_KEY_ID,
  CONTRIBUTOR_PAY_KEY_ID,
  PROTOCOL_ID,
  RECORD_SATS,
  REQUESTER_REFUND_KEY_ID,
  acceptCapture,
  acceptMessage,
  assertPayout,
  bindRequest,
  contributorPayoutKey,
  contributorSigningKey,
  deskFeeLockingKey,
  encodeAcceptFields,
  encodeRefundFields,
  encodeRequestFields,
  encodeSubmitFields,
  escrowKeyId,
  escrowLockingKey,
  feeOutputInstructions,
  isIdentityKey,
  refundCapture,
  refundMessage,
  requestMessage,
  requesterRefundKey,
  sameKey,
  submitMessage,
  type CaptureAccept,
  type CaptureRefund,
  type CaptureSubmit,
  type DeskState
} from '../../../protocol/capture'
import { originator } from './config'
import { sendPreview } from './messagebox'
import { submitCaptureTx, txFromWalletBeef } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface FundResult {
  requestId: string
  txid: string
  tx: number[]
  lockingScript: string
  requesterIdentity: string
  desk: DeskState
  overlayError?: string
}

export interface ChainResult {
  requestId: string
  txid: string
  tx: number[]
  desk: DeskState
  overlayError?: string
}

const COUNTERPARTY = 'anyone' as const

export function parseWhole(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export async function hashFile(file: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The accept pays the contributor named on the signed submission, not a key typed beside it. */
export function payeeForAccept(submission: CaptureSubmit, claimedIdentity: string): string {
  if (!sameKey(claimedIdentity, submission.contributorIdentity)) {
    throw new Error('The payout must go to the contributor who signed this capture.')
  }
  const key = contributorPayoutKey(submission.contributorIdentity)
  assertPayout(submission, key)
  return key
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function clip(label: string): string {
  const text = label.trim()
  return text.length <= 50 ? text : text.slice(0, 50)
}

async function signBytes(wallet: WalletClient, keyID: string, message: number[]): Promise<string> {
  const { signature } = await withTimeout(
    wallet.createSignature({
      data: message,
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: COUNTERPARTY
    }),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  return Utils.toHex(signature)
}

async function assertEscrowKey(wallet: WalletClient, identityKey: string, requestId: string): Promise<string> {
  const keyID = escrowKeyId(requestId)
  const { publicKey } = await withTimeout(
    wallet.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: COUNTERPARTY,
      forSelf: true
    }),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  if (!sameKey(publicKey, escrowLockingKey(identityKey, requestId))) {
    throw new Error('Wallet escrow key does not match the public derivation.')
  }
  return keyID
}

async function lockField(
  wallet: WalletClient,
  fields: number[][],
  requestId: string,
  keyID: string,
  tag: string,
  outputDescription: string,
  satoshis: number
): Promise<CreateActionOutput> {
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(fields, PROTOCOL_ID, keyID, COUNTERPARTY, true, false),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  return {
    satoshis,
    lockingScript: lockingScript.toHex(),
    outputDescription,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: COUNTERPARTY,
      forSelf: true,
      requestId
    }),
    tags: [BASKET, tag, requestId]
  }
}

interface HeldEscrow {
  outpoint: string
  satoshis: number
  beef: number[]
  lockingScript: string
  keyID: string
}

function outputIndex(txBytes: number[], lockingScriptHex: string): number {
  const tx = txFromWalletBeef(txBytes)
  const index = tx.outputs.findIndex((output) => output.lockingScript.toHex() === lockingScriptHex)
  if (index < 0) throw new Error('The escrow output is missing from the fund transaction.')
  return index
}

function beefBytes(tx: AtomicBEEF): number[] {
  return Array.isArray(tx) ? tx : Array.from(tx)
}

async function broadcastOrSign(
  wallet: WalletClient,
  response: CreateActionResult
): Promise<{ txid: string, tx: number[] }> {
  let txid = response.txid
  let tx = response.tx ? beefBytes(response.tx) : undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
    tx = signed.tx ? beefBytes(signed.tx) : undefined
  }
  if (!txid || !tx) throw new Error('Wallet did not return a transaction')
  return { txid, tx }
}

async function spendEscrow(
  wallet: WalletClient,
  held: HeldEscrow,
  outputs: CreateActionOutput[],
  description: string
): Promise<{ txid: string, tx: number[] }> {
  const [txid] = held.outpoint.split('.')
  const response = await wallet.createAction({
    description,
    inputBEEF: held.beef,
    inputs: [{
      outpoint: held.outpoint,
      inputDescription: 'Spend capture escrow',
      unlockingScriptLength: 73
    }],
    outputs,
    labels: [BASKET],
    options: { randomizeOutputs: false, trustSelf: 'known', knownTxids: [txid] }
  })
  if (!response.signableTransaction) throw new Error('Wallet did not return a signable spend')
  const txToSign = txFromWalletBeef(beefBytes(response.signableTransaction.tx))
  txToSign.inputs[0].unlockingScriptTemplate = pushdrop(wallet).unlock(
    PROTOCOL_ID,
    held.keyID,
    COUNTERPARTY,
    'all',
    false,
    held.satoshis,
    LockingScript.fromHex(held.lockingScript)
  )
  await txToSign.sign()
  const unlockingScript = txToSign.inputs[0].unlockingScript?.toHex()
  if (!unlockingScript) throw new Error('Failed to build unlocking script')
  const signed = await wallet.signAction({
    reference: response.signableTransaction.reference,
    spends: { '0': { unlockingScript } }
  })
  if (!signed.txid || !signed.tx) throw new Error('Wallet did not return a signed transaction')
  return { txid: signed.txid, tx: beefBytes(signed.tx) }
}

function heldFromBeef(tx: number[], lockingScript: string, keyID: string, satoshis: number, txid: string): HeldEscrow {
  const vout = outputIndex(tx, lockingScript)
  return {
    outpoint: `${txid}.${vout}`,
    satoshis,
    beef: tx,
    lockingScript,
    keyID
  }
}

async function overlayWrap(
  overlayUrl: string,
  tx: number[],
  requestId: string,
  txid: string,
  desk: DeskState
): Promise<ChainResult> {
  try {
    await submitCaptureTx(overlayUrl, tx)
    return { requestId, txid, tx, desk }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      requestId,
      txid,
      tx,
      desk,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function fundCapture(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState
): Promise<FundResult> {
  if (!desk.request) throw new Error('Draft a request first.')
  const root = identityKey.trim().toLowerCase()
  if (!isIdentityKey(root)) throw new Error('Requester key is invalid.')
  const stamped = bindRequest(desk.request, root)
  const keyID = await assertEscrowKey(wallet, root, stamped.requestId)
  const signed = { ...stamped, signature: await signBytes(wallet, keyID, requestMessage(stamped)) }
  const escrow = await lockField(
    wallet,
    encodeRequestFields(signed),
    signed.requestId,
    keyID,
    'request',
    clip(`Capture ${signed.location}`),
    signed.rewardSats
  )
  const response = await wallet.createAction({
    description: clip(`Fund ${signed.location}`),
    outputs: [escrow],
    labels: [BASKET, 'fund'],
    options: { randomizeOutputs: false }
  })
  const funded = await broadcastOrSign(wallet, response)
  const next: DeskState = {
    ...desk,
    request: signed,
    notice: 'Reward locked. The fund transaction is on the public book.'
  }
  const result = await overlayWrap(overlayUrl, funded.tx, signed.requestId, funded.txid, next)
  return { ...result, requesterIdentity: root, lockingScript: escrow.lockingScript }
}

export async function submitCaptureOnChain(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState,
  submission: CaptureSubmit,
  preview: string,
  requesterIdentity: string
): Promise<ChainResult> {
  if (!desk.request) throw new Error('Fund a request first.')
  const contributor = identityKey.trim().toLowerCase()
  if (!sameKey(contributor, submission.contributorIdentity)) {
    throw new Error('Contributor key is invalid.')
  }
  const { publicKey } = await withTimeout(
    wallet.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID: CONTRIBUTOR_KEY_ID,
      counterparty: COUNTERPARTY,
      forSelf: true
    }),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  if (!sameKey(publicKey, contributorSigningKey(contributor))) {
    throw new Error('Wallet contributor key does not match the public derivation.')
  }
  const signed: CaptureSubmit = {
    ...submission,
    contributorIdentity: contributor,
    signature: await signBytes(wallet, CONTRIBUTOR_KEY_ID, submitMessage({ ...submission, contributorIdentity: contributor, signature: '' }))
  }
  const output = await lockField(
    wallet,
    encodeSubmitFields(signed),
    signed.requestId,
    CONTRIBUTOR_KEY_ID,
    'submit',
    clip('Capture receipt'),
    RECORD_SATS
  )
  const response = await wallet.createAction({
    description: clip('Submit capture'),
    outputs: [output],
    labels: [BASKET, 'submit'],
    options: { randomizeOutputs: false }
  })
  const posted = await broadcastOrSign(wallet, response)
  if (preview.trim()) {
    void sendPreview(wallet, contributor, requesterIdentity, {
      requestId: signed.requestId,
      receiptHash: signed.receiptHash,
      preview
    })
  }
  const next: DeskState = {
    ...desk,
    pendingSubmissions: desk.pendingSubmissions.map((row) => row === submission ? signed : row),
    submissions: desk.submissions.map((row) => row === submission ? signed : row),
    notice: 'Receipt posted. It stays pending until the network timestamps it. The raw file stayed here.'
  }
  return overlayWrap(overlayUrl, posted.tx, signed.requestId, posted.txid, next)
}

function feeOutput(satoshis: number, description: string): CreateActionOutput {
  return {
    satoshis,
    lockingScript: p2pkhFromPublicKey(deskFeeLockingKey()),
    outputDescription: description,
    customInstructions: feeOutputInstructions()
  }
}

export async function acceptOnChain(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState,
  receiptHash: string,
  held: HeldEscrow
): Promise<ChainResult> {
  if (!desk.request) throw new Error('Fund a request first.')
  const root = identityKey.trim().toLowerCase()
  if (!sameKey(root, desk.request.requesterIdentity)) throw new Error('Only the requester can accept.')
  const drafted = acceptCapture(desk, receiptHash)
  const accept = drafted.accept as CaptureAccept
  const submission = [...drafted.submissions, ...drafted.pendingSubmissions].find((row) => row.receiptHash === accept.receiptHash)
  if (!submission) throw new Error('Accept a capture that was submitted.')
  const payee = payeeForAccept(submission, accept.contributorIdentity)
  const keyID = await assertEscrowKey(wallet, root, accept.requestId)
  const signed: CaptureAccept = { ...accept, signature: await signBytes(wallet, keyID, acceptMessage(accept)) }
  const outputs: CreateActionOutput[] = [
    {
      satoshis: signed.contributorSats,
      lockingScript: p2pkhFromPublicKey(payee),
      outputDescription: 'Pay contributor',
      customInstructions: JSON.stringify({
        protocolID: BRC29_PROTOCOL,
        keyID: CONTRIBUTOR_PAY_KEY_ID,
        counterparty: COUNTERPARTY,
        identityKey: submission.contributorIdentity
      })
    },
    feeOutput(signed.deskFeeSats, 'Capture desk fee'),
    feeOutput(signed.processingFeeSats, 'Capture processing fee'),
    await lockField(
      wallet,
      encodeAcceptFields(signed),
      signed.requestId,
      keyID,
      'accept',
      clip('Accept capture'),
      RECORD_SATS
    )
  ]
  const spent = await spendEscrow(wallet, held, outputs, clip(`Accept ${desk.request.location}`))
  const next: DeskState = { ...drafted, accept: signed, notice: 'Accepted. One transaction paid the contributor, the desk fee, and the processing fee.' }
  return overlayWrap(overlayUrl, spent.tx, signed.requestId, spent.txid, next)
}

export async function refundOnChain(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState,
  at: string,
  held: HeldEscrow
): Promise<ChainResult> {
  if (!desk.request) throw new Error('Fund a request first.')
  const root = identityKey.trim().toLowerCase()
  if (!sameKey(root, desk.request.requesterIdentity)) throw new Error('Only the requester can refund.')
  const drafted = refundCapture(desk, at)
  const refund = drafted.pendingRefund as CaptureRefund
  const keyID = await assertEscrowKey(wallet, root, refund.requestId)
  const signed: CaptureRefund = { ...refund, signature: await signBytes(wallet, keyID, refundMessage(refund)) }
  const outputs: CreateActionOutput[] = [
    {
      satoshis: signed.refundSats,
      lockingScript: p2pkhFromPublicKey(requesterRefundKey(root)),
      outputDescription: 'Refund requester',
      customInstructions: JSON.stringify({
        protocolID: BRC29_PROTOCOL,
        keyID: REQUESTER_REFUND_KEY_ID,
        counterparty: COUNTERPARTY,
        identityKey: root
      })
    },
    await lockField(
      wallet,
      encodeRefundFields(signed),
      signed.requestId,
      keyID,
      'refund',
      clip('Refund capture'),
      RECORD_SATS
    )
  ]
  const spent = await spendEscrow(wallet, held, outputs, clip(`Refund ${desk.request.location}`))
  const next: DeskState = { ...drafted, pendingRefund: signed, notice: 'Refund spent. Refunds count once the network timestamps them after the deadline.' }
  return overlayWrap(overlayUrl, spent.tx, signed.requestId, spent.txid, next)
}

export function heldEscrow(tx: number[], lockingScript: string, keyID: string, satoshis: number, txid: string): HeldEscrow {
  return heldFromBeef(tx, lockingScript, keyID, satoshis, txid)
}

export async function findHeldEscrow(wallet: WalletClient, requestId: string, rewardSats: number): Promise<HeldEscrow | null> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 200
  })
  for (const output of listed.outputs ?? []) {
    const outpoint = typeof output.outpoint === 'string' ? output.outpoint : ''
    const [txid, voutText] = outpoint.split('.')
    if (!txid || !listed.BEEF) continue
    let instructions: { keyID?: string, requestId?: string } = {}
    try {
      instructions = JSON.parse(output.customInstructions ?? '{}') as { keyID?: string, requestId?: string }
    } catch {
      continue
    }
    if (instructions.requestId !== requestId || instructions.keyID !== escrowKeyId(requestId)) continue
    const beef = beefBytes(listed.BEEF)
    const tx = txFromWalletBeef(beef)
    const vout = Number(voutText)
    const lockingScript = tx.outputs[vout]?.lockingScript.toHex()
    if (!lockingScript) continue
    return {
      outpoint,
      satoshis: Number(output.satoshis ?? rewardSats),
      beef,
      lockingScript,
      keyID: instructions.keyID
    }
  }
  return null
}
