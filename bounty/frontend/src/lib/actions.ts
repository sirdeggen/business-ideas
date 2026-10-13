import { P2PKH, PublicKey, PushDrop, Utils, WalletClient, type CreateActionOutput } from '@bsv/sdk'
import {
  BASKET,
  PROTOCOL_ID,
  RECORD_SATS,
  encodeFundFields,
  encodeSubmitFields,
  encodeTimelineFields,
  encodeVerdictFields,
  isIdentityKey,
  publicPayloads,
  recordPlan,
  type BountyFund,
  type DeskState
} from '../../../protocol/bounty'
import { originator } from './config'
import { sendReport } from './messagebox'
import { submitBountyTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface RecordResult {
  bountyId: string
  txid: string
  overlayError?: string
}

export function parseWhole(value: string): number | null {
  const trimmed = value.trim().replace(/,/g, '')
  if (!/^\d+$/.test(trimmed)) return null
  const parsed = Number(trimmed)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export function assertCanRecord(desk: DeskState, researcherKey: string): void {
  if (!desk.fund) throw new Error('Fund a pool first.')
  recordPlan(desk)
  if (desk.verdict && !isIdentityKey(researcherKey.trim())) {
    throw new Error('Add the researcher key under Advanced before recording a release.')
  }
  const blob = JSON.stringify(publicPayloads(desk))
  if (blob.includes('reportBody')) throw new Error('The report body must stay off the chain.')
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function clip(label: string): string {
  const text = label.trim()
  return text.length <= 50 ? text : text.slice(0, 50)
}

async function lockField(
  wallet: WalletClient,
  fields: number[][],
  bountyId: string,
  tag: string,
  outputDescription: string,
  satoshis: number
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
      bountyId
    }),
    tags: [BASKET, tag, bountyId]
  }
}

export async function recordBounty(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  desk: DeskState,
  researcherKey: string,
  reportBody: string
): Promise<RecordResult> {
  assertCanRecord(desk, researcherKey)
  const fund = desk.fund as BountyFund
  const bountyId = fund.bountyId
  const stamped: BountyFund = {
    ...fund,
    projectIdentity: fund.projectIdentity || identityKey
  }
  const plan = recordPlan(desk)
  const outputs: CreateActionOutput[] = [
    await lockField(
      wallet,
      encodeFundFields(stamped),
      bountyId,
      'fund',
      clip(`Pool ${stamped.projectName}`),
      plan.poolLockSats
    )
  ]
  if (desk.submission) {
    outputs.push(await lockField(
      wallet,
      encodeSubmitFields(desk.submission),
      bountyId,
      'submit',
      clip(`Hash ${desk.submission.researcherName}`),
      RECORD_SATS
    ))
  }
  if (desk.verdict) {
    outputs.push(await lockField(
      wallet,
      encodeVerdictFields(desk.verdict),
      bountyId,
      'verdict',
      clip(`Verdict ${desk.verdict.tier}`),
      RECORD_SATS
    ))
    outputs.push({
      satoshis: plan.researcherSats,
      lockingScript: p2pkhFromPublicKey(researcherKey.trim()),
      outputDescription: clip(`Pay ${desk.submission?.researcherName ?? 'researcher'}`)
    })
  }
  for (const event of desk.timeline) {
    outputs.push(await lockField(
      wallet,
      encodeTimelineFields(event),
      bountyId,
      'timeline',
      clip(`Clock ${event.stage}`),
      RECORD_SATS
    ))
  }

  const response = await wallet.createAction({
    description: clip(`Record ${stamped.projectName}`),
    outputs,
    labels: [BASKET, 'fund'],
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
  if (desk.submission && reportBody.trim()) {
    void sendReport(wallet, identityKey, stamped.projectIdentity, {
      bountyId,
      reportHash: desk.submission.reportHash,
      reportBody
    })
  }
  try {
    await submitBountyTx(overlayUrl, tx)
    return { bountyId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return { bountyId, txid, overlayError: detail.trim() || 'overlay submit failed with no message' }
  }
}
