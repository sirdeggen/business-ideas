import { LockingScript, PushDrop, Utils, WalletClient, type CreateActionOutput, type CreateActionResult } from '@bsv/sdk'
import {
  BASKET,
  LOCK_KEY_ID,
  PROTOCOL_ID,
  RECORD_SATS,
  SIGNING_COUNTERPARTY,
  encodeChangeFields,
  encodeFundFields,
  encodeGainFields,
  encodeOpenFields,
  encodeRecallFields,
  encodeSendFields,
  lockTimeFromIso,
  nowIso,
  openMandate,
  signRecordedDesk,
  stampForPublish,
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
import { submitMandateTx, txFromWalletBeef } from './overlay'
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
  const publishedAt = nowIso()
  const recorded = await signRecordedDesk(wallet, stampForPublish(desk, publishedAt))
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
  const outputs: CreateActionOutput[] = []
  for (const spec of specs) {
    outputs.push(await lockField(wallet, spec.fields, mandateId, spec.tag, spec.description))
  }
  const lockSats = recorded.funds.reduce((sum, fund) => sum + fund.amountSats, 0)
  const lockHex = recorded.mandate.lockHex
  const recall = recorded.recalls.length > 0 && lockSats > 0
  if (lockSats > 0) {
    outputs.push({
      satoshis: lockSats,
      lockingScript: lockHex,
      outputDescription: 'Owner lock',
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID: LOCK_KEY_ID,
        counterparty: SIGNING_COUNTERPARTY,
        mandateId
      }),
      tags: [BASKET, 'lock', mandateId]
    })
  }
  const funded = await finishAction(wallet, await wallet.createAction({
    description: 'Record mandate',
    outputs,
    lockTime: lockTimeFromIso(publishedAt),
    labels: [BASKET, 'open'],
    options: { randomizeOutputs: false, noSend: recall }
  }), recall)
  let txid = funded.txid
  const bodies = [funded.tx]
  if (recall) {
    const vout = outputIndex(funded.tx, lockHex)
    const release = await wallet.createAction({
      description: 'Recall mandate',
      inputBEEF: funded.tx,
      inputs: [{
        outpoint: `${funded.txid}.${vout}`,
        inputDescription: 'Spend owner lock',
        unlockingScriptLength: 73
      }],
      lockTime: lockTimeFromIso(publishedAt),
      labels: [BASKET, 'recall'],
      options: {
        randomizeOutputs: false,
        trustSelf: 'known',
        knownTxids: [funded.txid],
        sendWith: [funded.txid]
      }
    })
    if (!release.signableTransaction) throw new Error('Wallet did not return a signable recall')
    const spent = await spendOwnerLock(
      wallet,
      release.signableTransaction.reference,
      release.signableTransaction.tx as number[],
      lockSats,
      lockHex,
      funded.txid
    )
    txid = spent.txid
    bodies.push(spent.tx)
  }
  await nudgeMandate(wallet, identityKey, recorded.mandate.managerKey, {
    kind: recorded.recalls.length > 0 ? 'recall' : recorded.sends.length > 0 ? 'send' : recorded.changes.length > 0 ? 'change' : 'open',
    mandateId,
    txid
  })
  let overlayError: string | undefined
  for (const body of bodies) {
    try {
      await submitMandateTx(overlayUrl, body)
    } catch (error) {
      const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
      overlayError = detail.trim() || 'overlay submit failed with no message'
    }
  }
  return overlayError
    ? { mandateId, txid, desk: recorded, unsignedSends, overlayError }
    : { mandateId, txid, desk: recorded, unsignedSends }
}

function outputIndex(txBytes: number[], lockingScriptHex: string): number {
  const tx = txFromWalletBeef(txBytes)
  const index = tx.outputs.findIndex((output) => output.lockingScript.toHex() === lockingScriptHex)
  if (index < 0) throw new Error('The owner-lock output is missing from the fund transaction.')
  return index
}

async function finishAction(
  wallet: WalletClient,
  response: CreateActionResult,
  noSend: boolean
): Promise<{ txid: string, tx: number[] }> {
  let txid = response.txid
  let tx = response.tx as number[] | undefined
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {},
      options: noSend ? { noSend: true } : undefined
    })
    txid = signed.txid
    tx = signed.tx as number[] | undefined
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a transaction'), { cause: response })
  }
  return { txid, tx }
}

async function spendOwnerLock(
  wallet: WalletClient,
  reference: string,
  signableTx: number[],
  lockSats: number,
  lockingScriptHex: string,
  fundTxid: string
): Promise<{ txid: string, tx: number[] }> {
  const txToSign = txFromWalletBeef(signableTx)
  txToSign.inputs[0].unlockingScriptTemplate = new PushDrop(wallet, originator()).unlock(
    PROTOCOL_ID,
    LOCK_KEY_ID,
    SIGNING_COUNTERPARTY,
    'all',
    false,
    lockSats,
    LockingScript.fromHex(lockingScriptHex)
  )
  await txToSign.sign()
  const unlockingScript = txToSign.inputs[0].unlockingScript?.toHex()
  if (!unlockingScript) throw new Error('Failed to build the owner-lock spend')
  const signed = await wallet.signAction({
    reference,
    spends: { 0: { unlockingScript } },
    options: { sendWith: [fundTxid] }
  })
  if (!signed.txid || !signed.tx) throw new Error('Wallet did not return a signed recall')
  return { txid: signed.txid, tx: signed.tx as number[] }
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
