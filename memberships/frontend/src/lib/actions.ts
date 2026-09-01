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
  assertAmountSats,
  assertDurationSec,
  assertName,
  encodeDefFields,
  encodeKeyFields,
  expiresAtFrom,
  newMembershipId,
  nowIso,
  renewExpiry
} from '../../../protocol/membership'
import { originator } from './config'
import { lookupMembership, submitMembershipTx, type OverlayDef, type OverlayKey } from './overlay'

export interface CreateInput {
  name: string
  durationSec: number
  priceSats: number
}

export interface CreateResult {
  membershipId: string
  txid: string
  overlayError?: string
}

export interface KeyResult {
  membershipId: string
  txid: string
  expiresAt: string
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

export function assertCanCreate(input: CreateInput): CreateInput {
  assertName(input.name)
  assertDurationSec(input.durationSec)
  assertAmountSats(input.priceSats)
  return {
    name: input.name.trim(),
    durationSec: input.durationSec,
    priceSats: input.priceSats
  }
}

export async function createMembership(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: CreateInput
): Promise<CreateResult> {
  const ready = assertCanCreate(input)
  const membershipId = newMembershipId()
  const createdAt = nowIso()
  const keyID = randomKeyId()
  const lockingScript = await pushdrop(wallet).lock(
    encodeDefFields({
      membershipId,
      name: ready.name,
      durationSec: ready.durationSec,
      priceSats: ready.priceSats,
      issuerIdentity: identityKey,
      createdAt
    }),
    PROTOCOL_ID,
    keyID,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description: `Create membership: ${ready.name}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: `Membership ${ready.name}`,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'def', membershipId]
    }],
    labels: [BASKET, 'create'],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a membership transaction')
  }

  try {
    await submitMembershipTx(overlayUrl, response.tx as number[])
    return { membershipId, txid: response.txid }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      membershipId,
      txid: response.txid,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

async function emitPaidKey(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  membership: OverlayDef,
  expiresAt: string,
  issuedAt: string,
  description: string
): Promise<KeyResult> {
  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey: derived } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL_ID,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: membership.issuerIdentity,
    forSelf: false
  })
  const paymentScript = p2pkhFromPublicKey(derived)

  const receiptKeyId = randomKeyId()
  const receiptScript = await pushdrop(wallet).lock(
    encodeKeyFields({
      membershipId: membership.membershipId,
      memberIdentity: identityKey,
      issuedAt,
      durationSec: membership.durationSec,
      expiresAt,
      issuerIdentity: membership.issuerIdentity
    }),
    PROTOCOL_ID,
    receiptKeyId,
    'self',
    true,
    false
  )

  const response = await wallet.createAction({
    description,
    outputs: [
      {
        satoshis: membership.priceSats,
        lockingScript: paymentScript,
        outputDescription: `Membership ${membership.name}`,
        customInstructions: JSON.stringify({
          derivationPrefix,
          derivationSuffix,
          payee: membership.issuerIdentity
        })
      },
      {
        satoshis: 1,
        lockingScript: receiptScript.toHex(),
        outputDescription: `Timed key for ${membership.name}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID: receiptKeyId,
          counterparty: 'self'
        }),
        tags: [BASKET, 'key', membership.membershipId]
      }
    ],
    labels: [BASKET, 'key', membership.membershipId],
    options: { randomizeOutputs: false }
  })

  if (!response.txid || !response.tx) {
    throw new Error('Wallet did not return a membership key transaction')
  }

  try {
    await submitMembershipTx(overlayUrl, response.tx as number[])
    return {
      membershipId: membership.membershipId,
      txid: response.txid,
      expiresAt
    }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      membershipId: membership.membershipId,
      txid: response.txid,
      expiresAt,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function joinMembership(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  membership: OverlayDef
): Promise<KeyResult> {
  const live = await lookupMembership(overlayUrl, membership.membershipId, membership.txid || undefined)
  const current = live.membership ?? membership
  const issuedAt = nowIso()
  const expiresAt = expiresAtFrom(issuedAt, current.durationSec)
  return emitPaidKey(
    wallet,
    overlayUrl,
    identityKey,
    current,
    expiresAt,
    issuedAt,
    `Join ${current.name}`
  )
}

export async function renewMembership(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  membership: OverlayDef,
  previous: OverlayKey
): Promise<KeyResult> {
  const live = await lookupMembership(overlayUrl, membership.membershipId, previous.txid || undefined)
  const current = live.membership ?? membership
  const issuedAt = nowIso()
  const prev = live.key ?? previous
  const expiresAt = renewExpiry(prev.expiresAt, current.durationSec)
  return emitPaidKey(
    wallet,
    overlayUrl,
    identityKey,
    current,
    expiresAt,
    issuedAt,
    `Renew ${current.name}`
  )
}
