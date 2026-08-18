import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  BRC29_PROTOCOL_ID,
  PROTOCOL_ID,
  accrue,
  encodeStreamFields,
  isIdentityKey,
  newStreamId,
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

async function emitSnapshot(
  wallet: WalletClient,
  overlayUrl: string,
  stream: Omit<StreamPayload, 'tag' | 'rateSatsPerSec'> & { rateSatsPerSec?: number },
  description: string,
  payment?: { satoshis: number, lockingScript: string, payee: string, derivationPrefix: string, derivationSuffix: string }
): Promise<{ txid: string, streamId: string, outpoint: string }> {
  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    encodeStreamFields(stream),
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )

  const outputs = []
  if (payment && payment.satoshis > 0) {
    outputs.push({
      satoshis: payment.satoshis,
      lockingScript: payment.lockingScript,
      outputDescription: `Claim for ${stream.contractorName}`,
      customInstructions: JSON.stringify({
        derivationPrefix: payment.derivationPrefix,
        derivationSuffix: payment.derivationSuffix,
        payee: payment.payee
      })
    })
  }
  outputs.push({
    satoshis: 1,
    lockingScript: lockingScript.toHex(),
    outputDescription: `Stream for ${stream.contractorName}`,
    basket: BASKET,
    customInstructions: JSON.stringify({
      protocolID: PROTOCOL_ID,
      keyID,
      counterparty: 'self'
    }),
    tags: [BASKET, stream.frozen ? 'frozen' : 'open', stream.streamId]
  })

  const response = await wallet.createAction({
    description,
    outputs,
    labels: [BASKET, description.split(' ')[0]?.toLowerCase() || 'stream'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a stream transaction')
  }

  const submitted = await submitStreamTx(overlayUrl, response.tx as number[])
  if (submitted.admitted.length === 0) {
    throw new Error('overlay submit failed')
  }

  const outputIndex = streamOutputIndex(txFromWalletBeef(response.tx as number[]))
  return {
    txid: response.txid,
    streamId: stream.streamId,
    outpoint: `${response.txid}.${outputIndex}`
  }
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
  const { publicKey: treasurerIdentity } = await wallet.getPublicKey({ identityKey: true })
  const streamId = newStreamId()
  const now = new Date().toISOString()
  const contractorIdentity = input.contractorIdentity.trim()
  const created = await emitSnapshot(wallet, overlayUrl, {
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
  }, `Open stream: ${input.memo.trim()}`)

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

  return created
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
    throw new Error('Nothing has accrued to claim yet.')
  }

  const { publicKey: self } = await wallet.getPublicKey({ identityKey: true })
  const knownContractor = current.contractorIdentity && isIdentityKey(current.contractorIdentity)
    ? current.contractorIdentity
    : ''
  const payee = knownContractor || self
  if (!isIdentityKey(payee)) {
    throw new Error('Contractor identity is needed to claim. Paste it, or claim from the contractor wallet.')
  }

  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL_ID,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: payee,
    forSelf: false
  })

  const now = new Date().toISOString()
  const nextClaimed = current.claimedSats + math.claimableSats
  const created = await emitSnapshot(
    wallet,
    overlayUrl,
    snapshotOf(current, {
      contractorIdentity: current.contractorIdentity || payee,
      claimedSats: nextClaimed,
      lastClaimSats: math.claimableSats,
      lastClaimIso: now,
      updatedIso: now
    }),
    `Claim stream: ${current.memo || current.contractorName}`,
    {
      satoshis: math.claimableSats,
      lockingScript: p2pkhFromPublicKey(derived),
      payee,
      derivationPrefix,
      derivationSuffix
    }
  )

  const other = self === current.treasurerIdentity ? (current.contractorIdentity || '') : current.treasurerIdentity
  void notifyOtherParty(wallet, other, {
    streamId: current.streamId,
    kind: 'claimed',
    at: now,
    payload: {
      org: current.org,
      contractorName: current.contractorName,
      claimedSats: math.claimableSats
    }
  })

  return { txid: created.txid, streamId: current.streamId, claimedSats: math.claimableSats }
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
  const created = await emitSnapshot(
    wallet,
    overlayUrl,
    snapshotOf(current, {
      frozen: true,
      freezeIso: now,
      updatedIso: now
    }),
    `Freeze stream: ${current.memo || current.contractorName}`
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
