import { LockingScript, P2PKH, PublicKey, PushDrop, Utils, WalletClient, type CreateActionOutput } from '@bsv/sdk'
import {
  BASKET,
  DESK_FEE_KEY,
  PROTOCOL_ID,
  RECORD_SATS,
  encodeFundFields,
  encodeRemainderFields,
  encodeSubmitFields,
  encodeTimelineFields,
  encodeVerdictFields,
  isIdentityKey,
  poolKeyId,
  publicPayloads,
  recordPlan,
  releaseSpend,
  remainderFund,
  timelineMessage,
  verdictMessage,
  type BountyFund,
  type BountyVerdict,
  type DeskState,
  type TimelineEvent
} from '../../../protocol/bounty'
import { originator } from './config'
import { sendReport } from './messagebox'
import { submitBountyTx, txFromWalletBeef } from './overlay'
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

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function clip(label: string): string {
  const text = label.trim()
  return text.length <= 50 ? text : text.slice(0, 50)
}

async function projectKey(wallet: WalletClient, bountyId: string): Promise<{ keyID: string, publicKey: string }> {
  const keyID = poolKeyId(bountyId)
  const { publicKey } = await withTimeout(
    wallet.getPublicKey({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self',
      forSelf: true
    }),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  if (!isIdentityKey(publicKey)) throw new Error('Project key is invalid.')
  return { keyID, publicKey }
}

async function signBytes(wallet: WalletClient, keyID: string, message: number[]): Promise<string> {
  const { signature } = await withTimeout(
    wallet.createSignature({
      data: message,
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self'
    }),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  return Utils.toHex(signature)
}

async function lockField(
  wallet: WalletClient,
  fields: number[][],
  bountyId: string,
  keyID: string,
  tag: string,
  outputDescription: string,
  satoshis: number
): Promise<CreateActionOutput> {
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
      forSelf: true,
      bountyId
    }),
    tags: [BASKET, tag, bountyId]
  }
}

function poolOutputIndex(txBytes: number[], lockingScriptHex: string): number {
  const tx = txFromWalletBeef(txBytes)
  const index = tx.outputs.findIndex((output) => output.lockingScript.toHex() === lockingScriptHex)
  if (index < 0) throw new Error('The pool output is missing from the fund transaction.')
  return index
}

async function unlockPool(
  wallet: WalletClient,
  reference: string,
  signableTx: number[],
  keyID: string,
  poolSats: number,
  lockingScriptHex: string,
  fundTxid: string
): Promise<{ txid: string, tx: number[] }> {
  const txToSign = txFromWalletBeef(signableTx)
  txToSign.inputs[0].unlockingScriptTemplate = pushdrop(wallet).unlock(
    PROTOCOL_ID,
    keyID,
    'self',
    'all',
    false,
    poolSats,
    LockingScript.fromHex(lockingScriptHex)
  )
  await txToSign.sign()
  const unlockingScript = txToSign.inputs[0].unlockingScript?.toHex()
  if (!unlockingScript) throw new Error('Failed to build unlocking script')
  const signed = await wallet.signAction({
    reference,
    spends: { '0': { unlockingScript } },
    options: { sendWith: [fundTxid] }
  })
  if (!signed.txid || !signed.tx) throw new Error('Wallet did not return a signed transaction')
  return { txid: signed.txid, tx: signed.tx as number[] }
}

async function signVerdict(wallet: WalletClient, keyID: string, verdict: BountyVerdict): Promise<BountyVerdict> {
  const signature = await signBytes(wallet, keyID, verdictMessage(verdict))
  return { ...verdict, signature }
}

async function signTimeline(wallet: WalletClient, keyID: string, event: TimelineEvent): Promise<TimelineEvent> {
  const signature = await signBytes(wallet, keyID, timelineMessage(event))
  return { ...event, signature }
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
  const { keyID, publicKey } = await projectKey(wallet, bountyId)
  const stamped: BountyFund = { ...fund, projectIdentity: publicKey }
  const verdict = desk.verdict ? await signVerdict(wallet, keyID, desk.verdict) : null
  const timeline = await Promise.all(desk.timeline.map((event) => signTimeline(wallet, keyID, event)))
  const pool = await lockField(
    wallet,
    encodeFundFields(stamped),
    bountyId,
    keyID,
    'fund',
    clip(`Pool ${stamped.projectName}`),
    stamped.poolSats
  )
  const outputs: CreateActionOutput[] = [pool]
  if (desk.submission) {
    outputs.push(await lockField(
      wallet,
      encodeSubmitFields(desk.submission),
      bountyId,
      keyID,
      'submit',
      clip(`Hash ${desk.submission.researcherName}`),
      RECORD_SATS
    ))
  }
  if (verdict) {
    outputs.push(await lockField(
      wallet,
      encodeVerdictFields(verdict),
      bountyId,
      keyID,
      'verdict',
      clip(`Verdict ${verdict.tier}`),
      RECORD_SATS
    ))
  }
  for (const event of timeline) {
    outputs.push(await lockField(
      wallet,
      encodeTimelineFields(event),
      bountyId,
      keyID,
      'timeline',
      clip(`Clock ${event.stage}`),
      RECORD_SATS
    ))
  }

  const fundResponse = await wallet.createAction({
    description: clip(`Fund ${stamped.projectName}`),
    outputs,
    labels: [BASKET, 'fund'],
    options: verdict ? { noSend: true, randomizeOutputs: false } : { randomizeOutputs: false }
  })
  let txid = fundResponse.txid
  let tx = fundResponse.tx as number[] | undefined
  if ((!txid || !tx) && fundResponse.signableTransaction) {
    const signed = await wallet.signAction({
      reference: fundResponse.signableTransaction.reference,
      spends: {},
      options: verdict ? { noSend: true } : undefined
    })
    txid = signed.txid
    tx = signed.tx as number[] | undefined
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a transaction'), { cause: fundResponse })
  }

  const broadcast: number[][] = []
  if (verdict) {
    const spend = releaseSpend({ ...desk, fund: stamped, verdict })
    const releaseOutputs: CreateActionOutput[] = [{
      satoshis: spend.researcherSats,
      lockingScript: p2pkhFromPublicKey(researcherKey.trim()),
      outputDescription: clip(`Pay ${desk.submission?.researcherName ?? 'researcher'}`)
    }]
    if (spend.feeSats >= 1) {
      releaseOutputs.push({
        satoshis: spend.feeSats,
        lockingScript: p2pkhFromPublicKey(DESK_FEE_KEY),
        outputDescription: 'Bounty desk fee'
      })
    }
    const remainder = remainderFund(stamped, verdict)
    if (remainder) {
      releaseOutputs.push(await lockField(
        wallet,
        encodeRemainderFields(remainder),
        bountyId,
        keyID,
        'fund',
        clip(`Pool left ${stamped.projectName}`),
        remainder.poolSats
      ))
    }
    const vout = poolOutputIndex(tx, pool.lockingScript)
    const release = await wallet.createAction({
      description: clip(`Release ${verdict.tier}`),
      inputBEEF: tx,
      inputs: [{
        outpoint: `${txid}.${vout}`,
        inputDescription: 'Spend bounty pool',
        unlockingScriptLength: 73
      }],
      outputs: releaseOutputs,
      labels: [BASKET, 'release'],
      options: { randomizeOutputs: false, trustSelf: 'known', knownTxids: [txid] }
    })
    if (!release.signableTransaction) throw new Error('Wallet did not return a signable spend')
    const spent = await unlockPool(
      wallet,
      release.signableTransaction.reference,
      release.signableTransaction.tx as number[],
      keyID,
      stamped.poolSats,
      pool.lockingScript,
      txid
    )
    broadcast.push(tx, spent.tx)
    txid = spent.txid
    tx = spent.tx
  } else {
    broadcast.push(tx)
  }

  if (desk.submission && reportBody.trim()) {
    void sendReport(wallet, identityKey, stamped.projectIdentity, {
      bountyId,
      reportHash: desk.submission.reportHash,
      reportBody
    })
  }
  try {
    for (const body of broadcast) await submitBountyTx(overlayUrl, body)
    return { bountyId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return { bountyId, txid, overlayError: detail.trim() || 'overlay submit failed with no message' }
  }
}
