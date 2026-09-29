import { PushDrop, Utils, WalletClient } from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  RECORD_SATS,
  assertAmendment,
  assertAmountSats,
  assertFeeBps,
  encodeAttestFields,
  encodeDeedFields,
  encodeOpenFields,
  encodeReleaseFields,
  releaseReady,
  type DeskState
} from '../../../protocol/closing'
import { originator } from './config'
import { nudgeClosing } from './messagebox'
import { submitClosingTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface OpenForm {
  label: string
  amountSats: number
  feeBps: number
  amendmentFeeSats: number
  sellerName: string
  includeAgent: boolean
  agentName: string
}

export interface RecordResult {
  closingId: string
  txid: string
  overlayError?: string
}

export function parseWhole(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function assertCanOpen(input: OpenForm): OpenForm {
  const label = input.label.trim()
  if (!label) throw new Error('Name what you are closing.')
  assertAmountSats(input.amountSats)
  assertFeeBps(input.feeBps)
  assertAmendment(input.amendmentFeeSats)
  if (!input.sellerName.trim()) throw new Error('Name the seller.')
  if (input.includeAgent && !input.agentName.trim()) {
    throw new Error('Name the closing agent, or leave them off.')
  }
  return {
    ...input,
    label,
    sellerName: input.sellerName.trim(),
    agentName: input.agentName.trim()
  }
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

async function lockField(
  wallet: WalletClient,
  fields: number[][],
  closingId: string,
  tag: string,
  outputDescription: string
): Promise<{
  satoshis: number
  lockingScript: string
  outputDescription: string
  basket: string
  customInstructions: string
  tags: string[]
}> {
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(fields, PROTOCOL_ID, keyID, 'self', true, false),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  return {
    satoshis: RECORD_SATS,
    lockingScript: lockingScript.toHex(),
    outputDescription,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self',
      closingId
    }),
    tags: [BASKET, tag, closingId]
  }
}

export async function recordClosing(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState
): Promise<RecordResult> {
  const blocked = releaseReady({ ...desk, released: null })
  if (blocked || !desk.open || !desk.deed || !desk.attestation || !desk.released) {
    throw new Error(blocked ?? 'Release the closing before recording it.')
  }
  const closingId = desk.open.closingId
  const outputs = [
    await lockField(wallet, encodeOpenFields(desk.open), closingId, 'open', `Closing ${desk.open.label}`),
    await lockField(wallet, encodeDeedFields(desk.deed), closingId, 'deed', 'Deed hash'),
    await lockField(wallet, encodeAttestFields(desk.attestation), closingId, 'attest', 'Seller attestation'),
    await lockField(wallet, encodeReleaseFields(desk.released), closingId, 'release', 'Release')
  ]
  const response = await wallet.createAction({
    description: `Record closing: ${desk.open.label}`,
    outputs,
    labels: [BASKET, 'release'],
    options: { randomizeOutputs: false }
  })
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
  const recipients = [desk.open.originalPayeeIdentity, desk.open.buyerIdentity, desk.open.agentIdentity]
  await Promise.all(recipients.map((recipient) => nudgeClosing(wallet, identityKey, recipient, {
    kind: 'release',
    closingId,
    txid
  })))
  try {
    await submitClosingTx(overlayUrl, tx)
    return { closingId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return { closingId, txid, overlayError: detail.trim() || 'overlay submit failed with no message' }
  }
}
