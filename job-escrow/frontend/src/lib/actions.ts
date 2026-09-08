import {
  P2PKH,
  PublicKey,
  PushDrop,
  Transaction,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  BRC29_PROTOCOL_ID,
  PROTOCOL_ID,
  assertAmountSats,
  assertDeliverableHash,
  assertLabel,
  assertProviderName,
  canChallenge,
  canRefund,
  canRelease,
  canSubmit,
  encodeChallengeFields,
  encodeFundFields,
  encodeRefundFields,
  encodeReleaseFields,
  encodeSubmitFields,
  isClient,
  isIdentityKey,
  isProvider,
  newJobId,
  nowIso,
  parseJobFields
} from '../../../protocol/jobescrow'
import { originator } from './config'
import { NOT_CLIENT, NOT_HOLDING, NOT_PROVIDER } from './copy'
import { nudgeJob } from './messagebox'
import { lookupJob, submitJobTx, txFromWalletBeef, type OverlayFund } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface CustomInstructions {
  protocolID: [0 | 1 | 2, string]
  keyID: string
  counterparty: string
  jobId?: string
}

export interface HeldFund {
  outpoint: string
  satoshis: number
  beef: number[]
  customInstructions?: string
  fund: OverlayFund
}

export interface FundInput {
  label: string
  providerName: string
  providerIdentity: string
  amountSats: number
}

export interface FundResult {
  jobId: string
  txid: string
  overlayError?: string
}

export interface JobActionResult {
  jobId: string
  txid: string
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

function parseInstructions(raw: string | undefined): CustomInstructions {
  if (!raw) {
    throw new Error('Job is missing customInstructions; the wallet cannot unlock it')
  }
  return JSON.parse(raw) as CustomInstructions
}

function parseFundScript(lockingScript: Parameters<typeof PushDrop.decode>[0]) {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseJobFields(PushDrop.decode(lockingScript, position).fields)
      if (item && item.kind === 'fund') return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

export function assertCanFund(input: FundInput): FundInput {
  assertLabel(input.label)
  assertProviderName(input.providerName)
  assertAmountSats(input.amountSats)
  if (!isIdentityKey(input.providerIdentity)) {
    throw new Error('Provider key is under Advanced.')
  }
  return {
    label: input.label.trim(),
    providerName: input.providerName.trim(),
    providerIdentity: input.providerIdentity.trim(),
    amountSats: input.amountSats
  }
}

export async function listHeldFunds(wallet: WalletClient): Promise<HeldFund[]> {
  const listed = await wallet.listOutputs({
    basket: BASKET,
    include: 'entire transactions',
    includeCustomInstructions: true,
    limit: 200
  })
  const held: HeldFund[] = []
  for (const output of listed.outputs ?? []) {
    const outpoint = typeof output.outpoint === 'string' ? output.outpoint : ''
    const [txid] = outpoint.split('.')
    if (!txid || !listed.BEEF) continue
    try {
      const tx = txFromWalletBeef(listed.BEEF as number[])
      const vout = Number(outpoint.split('.')[1])
      const locking = tx.outputs[vout]?.lockingScript
      if (!locking) continue
      const fund = parseFundScript(locking)
      if (!fund) continue
      held.push({
        outpoint,
        satoshis: Number(output.satoshis ?? fund.amountSats),
        beef: listed.BEEF as number[],
        customInstructions: output.customInstructions,
        fund: { ...fund, txid, outputIndex: vout }
      })
    } catch {
      // Skip outputs this desk cannot parse.
    }
  }
  return held
}

async function findHeldFund(wallet: WalletClient, jobId: string): Promise<HeldFund> {
  const held = await listHeldFunds(wallet)
  const match = held.find((row) => row.fund.jobId === jobId)
  if (!match) throw new Error(NOT_HOLDING)
  return match
}

function spendInput(held: Pick<HeldFund, 'outpoint'>): {
  inputDescription: string
  outpoint: string
  unlockingScriptLength: number
} {
  return {
    inputDescription: 'Locked job',
    outpoint: held.outpoint,
    unlockingScriptLength: 73
  }
}

async function spendFund(
  wallet: WalletClient,
  held: HeldFund,
  newOutputs: Array<{
    satoshis: number
    lockingScript: string
    outputDescription: string
    basket?: string
    customInstructions?: string
    tags?: string[]
  }>,
  description: string
): Promise<{ txid: string, tx: number[] }> {
  const instructions = parseInstructions(held.customInstructions)
  const response = await wallet.createAction({
    description,
    inputBEEF: held.beef,
    inputs: [spendInput(held)],
    ...(newOutputs.length > 0 ? { outputs: newOutputs } : {}),
    labels: [BASKET],
    options: { randomizeOutputs: false }
  })

  if (!response.signableTransaction) {
    throw new Error('Wallet did not return a signable spend')
  }

  const txToSign = Transaction.fromBEEF(response.signableTransaction.tx)
  txToSign.inputs[0].unlockingScriptTemplate = pushdrop(wallet).unlock(
    instructions.protocolID,
    instructions.keyID,
    instructions.counterparty,
    'all',
    false,
    held.satoshis
  )
  await txToSign.sign()
  const unlockingScript = txToSign.inputs[0].unlockingScript?.toHex()
  if (!unlockingScript) throw new Error('Failed to build unlocking script')

  const signed = await wallet.signAction({
    reference: response.signableTransaction.reference,
    spends: {
      '0': { unlockingScript }
    }
  })

  if (!signed.txid || !signed.tx) {
    throw new Error('Wallet did not return a signed transaction')
  }
  return { txid: signed.txid, tx: signed.tx as number[] }
}

async function overlayOrError(
  overlayUrl: string,
  tx: number[],
  jobId: string,
  txid: string
): Promise<JobActionResult> {
  try {
    await submitJobTx(overlayUrl, tx)
    return { jobId, txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      jobId,
      txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function fundJob(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: FundInput
): Promise<FundResult> {
  const ready = assertCanFund(input)
  const jobId = newJobId()
  const createdAt = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeFundFields({
        jobId,
        label: ready.label,
        providerName: ready.providerName,
        providerIdentity: ready.providerIdentity,
        amountSats: ready.amountSats,
        clientIdentity: identityKey,
        createdAt
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Fund job: ${ready.label}`,
    outputs: [{
      satoshis: ready.amountSats,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Job ${ready.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        jobId
      }),
      tags: [BASKET, 'fund', jobId]
    }],
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
    throw Object.assign(new Error('Wallet did not return a fund transaction'), { cause: response })
  }

  void nudgeJob(wallet, identityKey, ready.providerIdentity, { kind: 'fund', jobId, txid })
  return overlayOrError(overlayUrl, tx, jobId, txid)
}

export async function submitHash(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  fund: OverlayFund,
  deliverableHash: string
): Promise<JobActionResult> {
  const live = await lookupJob(overlayUrl, fund.jobId, fund.txid)
  const current = live.fund ?? fund
  if (!canSubmit(live.status ?? 'funded')) {
    throw new Error('This job is not waiting for a hash.')
  }
  if (!isProvider(current, identityKey)) throw new Error(NOT_PROVIDER)
  const hash = assertDeliverableHash(deliverableHash)
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeSubmitFields({
        jobId: current.jobId,
        deliverableHash: hash,
        providerIdentity: identityKey,
        submittedAt: nowIso()
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Submit hash: ${current.label}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Hash for ${current.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        jobId: current.jobId
      }),
      tags: [BASKET, 'submit', current.jobId]
    }],
    labels: [BASKET, 'submit'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a submit transaction')
  }

  void nudgeJob(wallet, identityKey, current.clientIdentity, {
    kind: 'submit',
    jobId: current.jobId,
    txid: response.txid
  })
  return overlayOrError(overlayUrl, response.tx as number[], current.jobId, response.txid)
}

export async function releaseJob(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  fund: OverlayFund
): Promise<JobActionResult> {
  const live = await lookupJob(overlayUrl, fund.jobId, fund.txid)
  const current = live.fund ?? fund
  if (!canRelease(live.status)) {
    throw new Error('Release after the hash lands.')
  }
  if (!isClient(current, identityKey)) throw new Error(NOT_CLIENT)
  const held = await findHeldFund(wallet, current.jobId)

  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL_ID,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: current.providerIdentity,
    forSelf: false
  })
  const paymentScript = p2pkhFromPublicKey(derived)

  const receiptKeyId = randomKeyId()
  const receiptScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeReleaseFields({
        jobId: current.jobId,
        clientIdentity: identityKey,
        releasedAt: nowIso()
      }),
      PROTOCOL_ID,
      receiptKeyId,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const signed = await spendFund(wallet, held, [
    {
      satoshis: current.amountSats,
      lockingScript: paymentScript,
      outputDescription: `Release ${current.label}`,
      customInstructions: JSON.stringify({
        derivationPrefix,
        derivationSuffix,
        payee: current.providerIdentity
      })
    },
    {
      satoshis: 1,
      lockingScript: receiptScript.toHex(),
      outputDescription: `Released ${current.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID: receiptKeyId,
        counterparty: 'self',
        jobId: current.jobId
      }),
      tags: [BASKET, 'release', current.jobId]
    }
  ], `Release job: ${current.label}`)

  void nudgeJob(wallet, identityKey, current.providerIdentity, {
    kind: 'release',
    jobId: current.jobId,
    txid: signed.txid
  })
  return overlayOrError(overlayUrl, signed.tx, current.jobId, signed.txid)
}

export async function challengeJob(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  fund: OverlayFund
): Promise<JobActionResult> {
  const live = await lookupJob(overlayUrl, fund.jobId, fund.txid)
  const current = live.fund ?? fund
  if (!canChallenge(live.status)) {
    throw new Error('This job cannot be challenged.')
  }
  if (!isClient(current, identityKey)) throw new Error(NOT_CLIENT)
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeChallengeFields({
        jobId: current.jobId,
        clientIdentity: identityKey,
        challengedAt: nowIso()
      }),
      PROTOCOL_ID,
      keyID,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const response = await wallet.createAction({
    description: `Challenge job: ${current.label}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Challenge ${current.label}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self',
        jobId: current.jobId
      }),
      tags: [BASKET, 'challenge', current.jobId]
    }],
    labels: [BASKET, 'challenge'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a challenge transaction')
  }

  void nudgeJob(wallet, identityKey, current.providerIdentity, {
    kind: 'challenge',
    jobId: current.jobId,
    txid: response.txid
  })
  return overlayOrError(overlayUrl, response.tx as number[], current.jobId, response.txid)
}

export async function refundJob(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  fund: OverlayFund
): Promise<JobActionResult> {
  const live = await lookupJob(overlayUrl, fund.jobId, fund.txid)
  const current = live.fund ?? fund
  if (!canRefund(live.status)) {
    throw new Error('This job cannot be refunded.')
  }
  if (!isClient(current, identityKey)) throw new Error(NOT_CLIENT)
  const held = await findHeldFund(wallet, current.jobId)

  const receiptKeyId = randomKeyId()
  const receiptScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeRefundFields({
        jobId: current.jobId,
        clientIdentity: identityKey,
        refundedAt: nowIso()
      }),
      PROTOCOL_ID,
      receiptKeyId,
      'self',
      true,
      false
    ),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )

  const signed = await spendFund(wallet, held, [{
    satoshis: 1,
    lockingScript: receiptScript.toHex(),
    outputDescription: `Refund ${current.label}`,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID: receiptKeyId,
      counterparty: 'self',
      jobId: current.jobId
    }),
    tags: [BASKET, 'refund', current.jobId]
  }], `Refund job: ${current.label}`)

  void nudgeJob(wallet, identityKey, current.providerIdentity, {
    kind: 'refund',
    jobId: current.jobId,
    txid: signed.txid
  })
  return overlayOrError(overlayUrl, signed.tx, current.jobId, signed.txid)
}
