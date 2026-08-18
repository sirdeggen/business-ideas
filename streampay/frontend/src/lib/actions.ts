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
  INSUFFICIENT_FUND_MESSAGE,
  NOTHING_TO_CLAIM_MESSAGE,
  PROTOCOL_ID,
  UNFUNDED_STREAM_MESSAGE,
  accrue,
  encodeStreamFields,
  isIdentityKey,
  newStreamId,
  planClaim,
  planOpen,
  type StreamPayload
} from '../../../protocol/stream'
import { originator } from './config'
import { notifyOtherParty } from './messagebox'
import { lookupStreams, streamOutputIndex, submitStreamTx, txFromWalletBeef, type OverlayStream } from './overlay'

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

function looksLikeInsufficientFunds(error: unknown): boolean {
  const text = error instanceof Error ? error.message : String(error ?? '')
  return /insufficient|not enough (sats|funds|bitcoin|bsv|to)|balance too low|unable to fund|not sufficient/i.test(text)
}

async function createStreamAction(
  wallet: WalletClient,
  args: Parameters<WalletClient['createAction']>[0],
  kind: 'open' | 'claim' | 'freeze'
): Promise<Awaited<ReturnType<WalletClient['createAction']>>> {
  try {
    return await wallet.createAction(args)
  } catch (error) {
    if (kind === 'open' && looksLikeInsufficientFunds(error)) {
      throw new Error(INSUFFICIENT_FUND_MESSAGE)
    }
    throw error
  }
}

interface StreamOutput {
  satoshis: number
  lockingScript: string
  outputDescription: string
  basket?: string
  customInstructions?: string
  tags?: string[]
}

function snapshotOf(stream: OverlayStream, updates: Partial<StreamPayload>): Omit<StreamPayload, 'tag' | 'rateSatsPerSec'> {
  return {
    streamId: stream.streamId,
    org: stream.org,
    contractorName: stream.contractorName,
    contractorIdentity: updates.contractorIdentity ?? stream.contractorIdentity,
    treasurerIdentity: stream.treasurerIdentity,
    amountSats: stream.amountSats,
    startIso: stream.startIso,
    durationSec: stream.durationSec,
    frozen: updates.frozen ?? stream.frozen,
    claimedSats: updates.claimedSats ?? stream.claimedSats,
    freezeIso: updates.freezeIso ?? stream.freezeIso,
    amountUsd: stream.amountUsd,
    memo: stream.memo,
    updatedIso: updates.updatedIso ?? new Date().toISOString(),
    lastClaimSats: updates.lastClaimSats ?? stream.lastClaimSats,
    lastClaimIso: updates.lastClaimIso ?? stream.lastClaimIso
  }
}

async function lockStreamToken(
  wallet: WalletClient,
  stream: Omit<StreamPayload, 'tag' | 'rateSatsPerSec'> & { rateSatsPerSec?: number },
  counterparty: string,
  forSelf: boolean
): Promise<{ lockingScript: string, keyID: string }> {
  const keyID = stream.streamId
  const lockingScript = await pushdrop(wallet).lock(
    encodeStreamFields(stream),
    PROTOCOL_ID,
    keyID,
    counterparty,
    forSelf,
    false
  )
  return { lockingScript: lockingScript.toHex(), keyID }
}

function tokenOutput(
  stream: { contractorName: string, frozen: boolean, streamId: string },
  satoshis: number,
  lockingScript: string,
  keyID: string,
  counterparty: string
): StreamOutput {
  return {
    satoshis,
    lockingScript,
    outputDescription: `Stream for ${stream.contractorName}`,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty
    }),
    tags: [BASKET, stream.frozen ? 'frozen' : 'open', stream.streamId]
  }
}

async function submitCreated(
  overlayUrl: string,
  tx: number[],
  txid: string
): Promise<{ txid: string, streamId?: string, outpoint: string }> {
  const submitted = await submitStreamTx(overlayUrl, tx)
  if (submitted.admitted.length === 0) {
    throw new Error('overlay submit failed')
  }
  const outputIndex = streamOutputIndex(txFromWalletBeef(tx))
  return { txid, outpoint: `${txid}.${outputIndex}` }
}

async function emitTreasurerSnapshot(
  wallet: WalletClient,
  overlayUrl: string,
  stream: Omit<StreamPayload, 'tag' | 'rateSatsPerSec'> & { rateSatsPerSec?: number },
  description: string,
  satoshis: number
): Promise<{ txid: string, streamId: string, outpoint: string }> {
  const { lockingScript, keyID } = await lockStreamToken(wallet, stream, 'self', true)
  const response = await createStreamAction(wallet, {
    description,
    outputs: [tokenOutput(stream, satoshis, lockingScript, keyID, 'self')],
    labels: [BASKET, description.split(' ')[0]?.toLowerCase() || 'stream'],
    options: { randomizeOutputs: false }
  }, satoshis > 1 ? 'open' : 'freeze')

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a stream transaction')
  }

  const submitted = await submitCreated(overlayUrl, response.tx as number[], response.txid)
  return { ...submitted, streamId: stream.streamId }
}

async function spendStreamUtxo(
  wallet: WalletClient,
  stream: OverlayStream,
  description: string,
  outputs: StreamOutput[]
): Promise<{ txid: string, tx: number[] }> {
  if (!stream.beef || stream.beef.length === 0 || !(stream.satoshis > 0)) {
    throw new Error(UNFUNDED_STREAM_MESSAGE)
  }

  try {
    await wallet.internalizeAction({
      tx: stream.beef,
      outputs: [{
        outputIndex: stream.outputIndex,
        protocol: 'basket insertion',
        insertionRemittance: {
          basket: BASKET,
          customInstructions: JSON.stringify({
            protocolID: PROTOCOL_ID,
            keyID: stream.streamId,
            counterparty: stream.treasurerIdentity
          }),
          tags: [BASKET, stream.frozen ? 'frozen' : 'open', stream.streamId]
        }
      }],
      description: `Hold stream for ${stream.contractorName}`
    })
  } catch {
    // Already in the basket, or createAction will take inputBEEF.
  }

  const response = await createStreamAction(wallet, {
    description,
    inputBEEF: stream.beef,
    inputs: [{
      inputDescription: `Stream for ${stream.contractorName}`,
      outpoint: `${stream.txid}.${stream.outputIndex}`,
      unlockingScriptLength: 73
    }],
    outputs,
    labels: [BASKET, 'claim', stream.streamId],
    options: { randomizeOutputs: false }
  }, 'claim')

  if (response.txid && response.tx && !response.signableTransaction) {
    return { txid: response.txid, tx: response.tx as number[] }
  }
  if (!response.signableTransaction) {
    throw new Error('Wallet did not return a stream transaction')
  }

  const txToSign = Transaction.fromBEEF(response.signableTransaction.tx)
  txToSign.inputs[0].unlockingScriptTemplate = pushdrop(wallet).unlock(
    PROTOCOL_ID,
    stream.streamId,
    stream.treasurerIdentity,
    'all',
    false,
    stream.satoshis
  )
  await txToSign.sign()
  const unlockingScript = txToSign.inputs[0].unlockingScript?.toHex()
  if (!unlockingScript) throw new Error('This claim has to come from the contractor’s wallet.')

  const signed = await wallet.signAction({
    reference: response.signableTransaction.reference,
    spends: {
      '0': { unlockingScript }
    }
  })
  if (!signed.txid || !signed.tx) {
    throw new Error('Wallet did not return a stream transaction')
  }
  return { txid: signed.txid, tx: signed.tx as number[] }
}

export async function openStream(
  wallet: WalletClient,
  overlayUrl: string,
  input: {
    org: string
    contractorName: string
    contractorIdentity: string
    memo: string
    amountSats: number
    amountUsd: string
    startIso: string
    durationSec: number
  }
): Promise<{ txid: string, streamId: string, outpoint: string }> {
  const contractorIdentity = input.contractorIdentity.trim()
  if (!isIdentityKey(contractorIdentity)) {
    throw new Error('Contractor identity is needed to open a funded stream.')
  }
  const { potSats } = planOpen(input.amountSats)
  const { publicKey: treasurerIdentity } = await wallet.getPublicKey({ identityKey: true })
  const streamId = newStreamId()
  const now = new Date().toISOString()
  const stream = {
    streamId,
    org: input.org.trim(),
    contractorName: input.contractorName.trim(),
    contractorIdentity,
    treasurerIdentity,
    amountSats: input.amountSats,
    startIso: input.startIso,
    durationSec: input.durationSec,
    frozen: false,
    claimedSats: 0,
    freezeIso: '',
    amountUsd: input.amountUsd,
    memo: input.memo.trim(),
    updatedIso: now,
    lastClaimSats: 0,
    lastClaimIso: ''
  }
  const { lockingScript, keyID } = await lockStreamToken(wallet, stream, contractorIdentity, false)
  const response = await createStreamAction(wallet, {
    description: `Open stream: ${input.memo.trim()}`,
    outputs: [tokenOutput(stream, potSats, lockingScript, keyID, contractorIdentity)],
    labels: [BASKET, 'open'],
    options: { randomizeOutputs: false }
  }, 'open')

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a stream transaction')
  }

  const submitted = await submitCreated(overlayUrl, response.tx as number[], response.txid)

  void notifyOtherParty(wallet, contractorIdentity, {
    streamId,
    kind: 'opened',
    at: now,
    payload: {
      org: input.org.trim(),
      contractorName: input.contractorName.trim(),
      memo: input.memo.trim()
    }
  })

  return { ...submitted, streamId }
}

export async function claimStream(
  wallet: WalletClient,
  overlayUrl: string,
  stream: OverlayStream
): Promise<{ txid: string, streamId: string, claimedSats: number }> {
  const live = (await lookupStreams(overlayUrl, {
    streamId: stream.streamId,
    txid: stream.txid || undefined
  }))[0]
  const current = live ?? stream
  const math = accrue(current)
  if (math.claimableSats < 1) {
    throw new Error(NOTHING_TO_CLAIM_MESSAGE)
  }

  const plan = planClaim({
    fundedSats: current.satoshis,
    amountSats: current.amountSats,
    claimableSats: math.claimableSats
  })

  const { publicKey: self } = await wallet.getPublicKey({ identityKey: true })
  const knownContractor = current.contractorIdentity && isIdentityKey(current.contractorIdentity)
    ? current.contractorIdentity
    : ''
  if (!knownContractor) {
    throw new Error('Contractor identity is needed to claim. Open this stream with the contractor’s key.')
  }
  if (self !== knownContractor) {
    throw new Error('This claim has to come from the contractor’s wallet.')
  }

  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL_ID,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: knownContractor,
    forSelf: false
  })

  const now = new Date().toISOString()
  const nextClaimed = current.claimedSats + plan.claimSats
  const next = snapshotOf(current, {
    contractorIdentity: knownContractor,
    claimedSats: nextClaimed,
    lastClaimSats: plan.claimSats,
    lastClaimIso: now,
    updatedIso: now
  })
  const { lockingScript, keyID } = await lockStreamToken(wallet, next, current.treasurerIdentity, true)
  const potSats = plan.outputSatoshis[1]
  const spent = await spendStreamUtxo(
    wallet,
    current,
    `Claim stream: ${current.memo || current.contractorName}`,
    [
      {
        satoshis: plan.claimSats,
        lockingScript: p2pkhFromPublicKey(derived),
        outputDescription: `Claim for ${current.contractorName}`,
        customInstructions: JSON.stringify({
          derivationPrefix,
          derivationSuffix,
          payee: knownContractor
        })
      },
      tokenOutput(next, potSats, lockingScript, keyID, current.treasurerIdentity)
    ]
  )

  const submitted = await submitCreated(overlayUrl, spent.tx, spent.txid)

  void notifyOtherParty(wallet, current.treasurerIdentity, {
    streamId: current.streamId,
    kind: 'claimed',
    at: now,
    payload: {
      org: current.org,
      contractorName: current.contractorName,
      claimedSats: plan.claimSats
    }
  })

  return { txid: submitted.txid, streamId: current.streamId, claimedSats: plan.claimSats }
}

export async function freezeStream(
  wallet: WalletClient,
  overlayUrl: string,
  stream: OverlayStream
): Promise<{ txid: string, streamId: string }> {
  const { publicKey: self } = await wallet.getPublicKey({ identityKey: true })
  if (self !== stream.treasurerIdentity) {
    throw new Error('Only the treasurer can freeze this stream.')
  }
  if (stream.frozen) {
    throw new Error('This stream is already frozen.')
  }

  const live = (await lookupStreams(overlayUrl, {
    streamId: stream.streamId,
    txid: stream.txid || undefined
  }))[0]
  const current = live ?? stream
  if (current.frozen) throw new Error('This stream is already frozen.')

  const now = new Date().toISOString()
  const created = await emitTreasurerSnapshot(
    wallet,
    overlayUrl,
    snapshotOf(current, {
      frozen: true,
      freezeIso: now,
      updatedIso: now
    }),
    `Freeze stream: ${current.memo || current.contractorName}`,
    1
  )

  void notifyOtherParty(wallet, current.contractorIdentity, {
    streamId: current.streamId,
    kind: 'frozen',
    at: now,
    payload: {
      org: current.org,
      contractorName: current.contractorName
    }
  })

  return { txid: created.txid, streamId: current.streamId }
}
