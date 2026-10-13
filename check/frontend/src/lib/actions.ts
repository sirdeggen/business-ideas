import { PushDrop, Utils, WalletClient } from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  encodeFlagFields,
  encodeReceiptFields,
  fileFlag,
  identityFor,
  runCheck,
  type CheckFlag,
  type CheckInput,
  type CheckReceipt
} from '../../../protocol/check'
import { originator } from './config'
import { nudgeCheck } from './messagebox'
import { submitCheckTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface RecordResult {
  id: string
  txid: string
  overlayError?: string
}

export function parseWhole(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function priorList(text: string): string[] {
  return text.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0)
}

export function assertCanCheck(input: CheckInput): CheckInput {
  runCheck(input, '2026-10-13T00:00:00Z', 'ab'.repeat(16))
  return input
}

export function assertCanFile(input: Parameters<typeof fileFlag>[0]): CheckFlag {
  return fileFlag(input, '2026-10-13T00:00:00Z', 'cd'.repeat(16))
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
  id: string,
  tag: string,
  satoshis: number,
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
    satoshis,
    lockingScript: lockingScript.toHex(),
    outputDescription,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self',
      id
    }),
    tags: [BASKET, tag, id]
  }
}

async function broadcast(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  description: string,
  output: Awaited<ReturnType<typeof lockField>>,
  notice: { kind: 'flag' | 'receipt', id: string, recipient: string }
): Promise<RecordResult> {
  const response = await wallet.createAction({
    description,
    outputs: [output],
    labels: [BASKET, notice.kind],
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
  await nudgeCheck(wallet, identityKey, notice.recipient, {
    kind: notice.kind,
    checkId: notice.id,
    txid
  })
  try {
    await submitCheckTx(overlayUrl, tx)
    return { id: notice.id, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return { id: notice.id, txid, overlayError: detail.trim() || 'overlay submit failed with no message' }
  }
}

export async function recordReceipt(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  receipt: CheckReceipt
): Promise<RecordResult> {
  const output = await lockField(
    wallet,
    encodeReceiptFields(receipt),
    receipt.checkId,
    'receipt',
    Math.max(receipt.checkFeeSats, 1),
    `Check fee ${receipt.checkFeeSats}`
  )
  return broadcast(wallet, overlayUrl, identityKey, `Record check receipt ${receipt.checkId}`, output, {
    kind: 'receipt',
    id: receipt.checkId,
    recipient: identityFor(receipt.reporterName || receipt.payee)
  })
}

export async function recordFlag(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  flag: CheckFlag
): Promise<RecordResult> {
  const output = await lockField(
    wallet,
    encodeFlagFields(flag),
    flag.flagId,
    'flag',
    Math.max(flag.stakeSats, 1),
    `Flag stake ${flag.stakeSats}`
  )
  return broadcast(wallet, overlayUrl, identityKey, `Record check flag ${flag.flagId}`, output, {
    kind: 'flag',
    id: flag.flagId,
    recipient: identityFor(flag.reporterName)
  })
}
