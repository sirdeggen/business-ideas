import { PushDrop, Utils, WalletClient } from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  RECORD_SATS,
  encodeEditionFields,
  encodeGiftFields,
  encodeMintFields,
  encodeResaleFields,
  encodeSendFields,
  encodeShowFields,
  holderOf,
  openEdition,
  type DeskState
} from '../../../protocol/keepsake'
import { originator } from './config'
import { nudgeKeepsake } from './messagebox'
import { submitKeepsakeTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface OpenForm {
  orgName: string
  title: string
  editionSize: number
  mintFeeSats: number
  royaltyBps: number
  deskBps: number
}

export interface RecordResult {
  keepsakeId: string
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
  const ready: OpenForm = {
    ...input,
    orgName: input.orgName.trim(),
    title: input.title.trim()
  }
  openEdition(ready, '2026-10-13T00:00:00Z', 'ab'.repeat(16))
  return ready
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
  keepsakeId: string,
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
      keepsakeId
    }),
    tags: [BASKET, tag, keepsakeId]
  }
}

export async function recordKeepsake(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState
): Promise<RecordResult> {
  if (!desk.edition) throw new Error('Open an edition first.')
  const keepsakeId = desk.edition.keepsakeId
  const specs: Array<{ fields: number[][], tag: string, description: string }> = [
    { fields: encodeEditionFields(desk.edition), tag: 'edition', description: `Keepsake ${desk.edition.title}` },
    ...desk.mints.map((mint) => ({
      fields: encodeMintFields(mint),
      tag: 'mint',
      description: `Mint #${mint.serial}`
    })),
    ...desk.sends.map((send) => ({
      fields: encodeSendFields(send),
      tag: 'send',
      description: `Send #${send.serial}`
    })),
    ...desk.gifts.map((gift) => ({
      fields: encodeGiftFields(gift),
      tag: 'gift',
      description: `Gift #${gift.serial}`
    })),
    ...desk.shows.map((show) => ({
      fields: encodeShowFields(show),
      tag: 'show',
      description: `Profile #${show.serial}`
    })),
    ...desk.resales.map((resale) => ({
      fields: encodeResaleFields(resale),
      tag: 'resale',
      description: `Resale #${resale.serial}`
    }))
  ]
  const outputs = []
  for (const spec of specs) {
    outputs.push(await lockField(wallet, spec.fields, keepsakeId, spec.tag, spec.description))
  }
  const response = await wallet.createAction({
    description: `Record keepsake: ${desk.edition.title}`,
    outputs,
    labels: [BASKET, 'edition'],
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
  const latest = desk.resales.at(-1) ?? desk.gifts.at(-1) ?? desk.sends.at(-1)
  const recipient = latest
    ? ('toKey' in latest ? latest.toKey : latest.recipientKey)
    : ''
  const serial = latest?.serial ?? desk.mints.at(-1)?.serial
  await nudgeKeepsake(wallet, identityKey, recipient || holderOf(desk, serial ?? 0) || '', {
    kind: desk.resales.length > 0 ? 'resale' : desk.gifts.length > 0 ? 'gift' : desk.sends.length > 0 ? 'send' : 'edition',
    keepsakeId,
    serial,
    txid
  })
  try {
    await submitKeepsakeTx(overlayUrl, tx)
    return { keepsakeId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return { keepsakeId, txid, overlayError: detail.trim() || 'overlay submit failed with no message' }
  }
}
