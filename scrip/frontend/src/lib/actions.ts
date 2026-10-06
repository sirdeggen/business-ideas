import { PushDrop, Utils, WalletClient } from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  RECORD_SATS,
  encodeAttestFields,
  encodeIssueFields,
  encodeMintFields,
  encodeRedeemFields,
  identityFor,
  issueBrand,
  type DeskState
} from '../../../protocol/scrip'
import { originator } from './config'
import { nudgeScrip } from './messagebox'
import { submitScripTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface IssueForm {
  orgName: string
  brandName: string
  ticker: string
  unitLabel: string
  setupFeeSats: number
  mintFeeBps: number
  redeemFeeBps: number
  satsPerUnit: number
}

export interface RecordResult {
  scripId: string
  txid: string
  overlayError?: string
}

export function parseWhole(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function assertCanIssue(input: IssueForm): IssueForm {
  const ready: IssueForm = {
    ...input,
    orgName: input.orgName.trim(),
    brandName: input.brandName.trim(),
    ticker: input.ticker.trim(),
    unitLabel: input.unitLabel.trim()
  }
  issueBrand(ready, '2026-10-06T00:00:00Z', 'ab'.repeat(16))
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
  scripId: string,
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
      scripId
    }),
    tags: [BASKET, tag, scripId]
  }
}

export async function recordScrip(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState
): Promise<RecordResult> {
  if (!desk.issue) throw new Error('Issue a brand first.')
  const scripId = desk.issue.scripId
  const specs: Array<{ fields: number[][], tag: string, description: string }> = [
    { fields: encodeIssueFields(desk.issue), tag: 'issue', description: `Scrip ${desk.issue.brandName}` },
    ...desk.mints.map((mint, index) => ({
      fields: encodeMintFields(mint),
      tag: 'mint',
      description: `Mint ${index + 1}`
    })),
    ...desk.attestations.map((attest, index) => ({
      fields: encodeAttestFields(attest),
      tag: 'attest',
      description: `Reserve attestation ${index + 1}`
    })),
    ...desk.redeems.map((redeem, index) => ({
      fields: encodeRedeemFields(redeem),
      tag: 'redeem',
      description: `Redeem ${index + 1}`
    }))
  ]
  const outputs = []
  for (const spec of specs) {
    outputs.push(await lockField(wallet, spec.fields, scripId, spec.tag, spec.description))
  }
  const response = await wallet.createAction({
    description: `Record scrip: ${desk.issue.brandName}`,
    outputs,
    labels: [BASKET, 'issue'],
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
  await nudgeScrip(wallet, identityKey, identityFor(desk.issue.orgName), {
    kind: desk.redeems.length > 0 ? 'redeem' : desk.attestations.length > 0 ? 'attest' : desk.mints.length > 0 ? 'mint' : 'issue',
    scripId,
    txid
  })
  try {
    await submitScripTx(overlayUrl, tx)
    return { scripId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return { scripId, txid, overlayError: detail.trim() || 'overlay submit failed with no message' }
  }
}
