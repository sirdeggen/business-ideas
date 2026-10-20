import { PushDrop, Utils, WalletClient } from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  RECORD_SATS,
  encodeChangeFields,
  encodeFundFields,
  encodeGainFields,
  encodeOpenFields,
  encodeRecallFields,
  encodeSendFields,
  openMandate,
  signRecordedDesk,
  type ChangeRecord,
  type DeskState,
  type FundRecord,
  type GainRecord,
  type OpenInput,
  type RecallRecord,
  type SendRecord
} from '../../../protocol/mandate'
import { originator } from './config'
import { nudgeMandate } from './messagebox'
import { submitMandateTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface RecordResult {
  mandateId: string
  txid: string
  desk: DeskState
  overlayError?: string
  unsignedSends: number
}

export function parseWhole(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function assertCanOpen(input: OpenInput): OpenInput {
  const ready: OpenInput = {
    ...input,
    orgName: input.orgName.trim(),
    managerKey: input.managerKey.trim(),
    whitelist: typeof input.whitelist === 'string' ? input.whitelist.trim() : input.whitelist
  }
  openMandate(ready, '2026-10-20T00:00:00Z', 'ab'.repeat(16))
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
  mandateId: string,
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
      mandateId
    }),
    tags: [BASKET, tag, mandateId]
  }
}

export async function recordMandate(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState
): Promise<RecordResult> {
  if (!desk.mandate) throw new Error('Open a mandate first.')
  const recorded = await signRecordedDesk(wallet, desk)
  if (!recorded.mandate) throw new Error('Open a mandate first.')
  const mandateId = recorded.mandate.mandateId
  const specs: Array<{ fields: number[][], tag: string, description: string }> = [
    { fields: encodeOpenFields(recorded.mandate), tag: 'open', description: `Mandate ${recorded.mandate.orgName}` }
  ]
  const signed = <T extends { ownerSig?: string, managerSig?: string }>(row: T): boolean => {
    const sig = row.managerSig ?? row.ownerSig ?? ''
    return sig.length > 0
  }
  for (const fund of recorded.funds) {
    if (!signed(fund)) continue
    specs.push({ fields: encodeFundFields(fund), tag: 'fund', description: 'Mandate fund' })
  }
  for (const gain of recorded.gains) {
    if (!signed(gain)) continue
    specs.push({ fields: encodeGainFields(gain), tag: 'gain', description: 'Mandate gain' })
  }
  let unsignedSends = 0
  for (const send of recorded.sends) {
    if (!signed(send)) {
      unsignedSends += 1
      continue
    }
    specs.push({ fields: encodeSendFields(send), tag: 'send', description: 'Mandate send' })
  }
  for (const recall of recorded.recalls) {
    if (!signed(recall)) continue
    specs.push({ fields: encodeRecallFields(recall), tag: 'recall', description: 'Mandate recall' })
  }
  for (const change of recorded.changes) {
    if (!signed(change)) continue
    specs.push({ fields: encodeChangeFields(change), tag: 'change', description: 'Mandate change' })
  }
  const outputs = []
  for (const spec of specs) {
    outputs.push(await lockField(wallet, spec.fields, mandateId, spec.tag, spec.description))
  }
  const response = await wallet.createAction({
    description: `Record mandate: ${recorded.mandate.orgName}`,
    outputs,
    labels: [BASKET, 'open'],
    options: { randomizeOutputs: false }
  })
  let txid = response.txid
  let tx = response.tx as number[] | undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signedTx = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signedTx.txid
    tx = signedTx.tx as number[] | undefined
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a transaction'), { cause: response })
  }
  await nudgeMandate(wallet, identityKey, recorded.mandate.managerKey, {
    kind: recorded.recalls.length > 0 ? 'recall' : recorded.sends.length > 0 ? 'send' : recorded.changes.length > 0 ? 'change' : 'open',
    mandateId,
    txid
  })
  try {
    await submitMandateTx(overlayUrl, tx)
    return { mandateId, txid, desk: recorded, unsignedSends }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return { mandateId, txid, desk: recorded, unsignedSends, overlayError: detail.trim() || 'overlay submit failed with no message' }
  }
}

export function signedFunds(funds: FundRecord[]): FundRecord[] {
  return funds.filter((row) => row.ownerSig)
}

export function signedGains(gains: GainRecord[]): GainRecord[] {
  return gains.filter((row) => row.ownerSig)
}

export function signedSends(sends: SendRecord[]): SendRecord[] {
  return sends.filter((row) => row.managerSig)
}

export function signedRecalls(recalls: RecallRecord[]): RecallRecord[] {
  return recalls.filter((row) => row.ownerSig)
}

export function signedChanges(changes: ChangeRecord[]): ChangeRecord[] {
  return changes.filter((row) => row.ownerSig)
}
