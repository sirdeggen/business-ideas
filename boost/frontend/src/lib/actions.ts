import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  type WalletClient
} from '@bsv/sdk'
import {
  ATTEST_SATS,
  BASKET,
  PROFILE_FEE_SATS,
  PROTOCOL_ID,
  SIGNING_KEY_ID,
  admitProfiles,
  assertBlurb,
  assertLink,
  assertName,
  buildReading,
  bytesToHex,
  canonicalBoostBytes,
  canonicalProfileBytes,
  encodeBoostFields,
  encodeProfileFields,
  endsAtFrom,
  isBoostPack,
  isCategory,
  isIdentityKey,
  isOwner,
  makeBoostId,
  nowIso,
  profileBindingId,
  profileCollisionKey,
  quoteBoost,
  readingSlug,
  type BoostPack,
  type BoostReading,
  type BoostRecord,
  type Category,
  type ProfileRecord
} from '../../../protocol/boost'
import { originator } from './config'
import { DUPLICATE_PROFILE, NOT_OWNER } from './copy'
import { nudgeBoost } from './messagebox'
import { submitBoostTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface BuyInput {
  category: string
  name: string
  blurb: string
  link: string
  desk: string
}

export interface PreparedProfile {
  category: Category
  name: string
  blurb: string
  link: string
  owner: string
  desk: string
  profileFeeSats: number
}

export interface BuyResult {
  profileId: string
  txid: string
  profileFeeSats: number
  overlayError?: string
}

export interface BoostResult {
  profileId: string
  boostId: string
  txid: string
  pack: BoostPack
  paidSats: number
  endsAt: string
  overlayError?: string
}

function randomKeyId(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toBase64(Array.from(bytes))
}

function randomNonce(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Utils.toHex(Array.from(bytes))
}

function pushdrop(wallet: WalletClient): PushDrop {
  return new PushDrop(wallet, originator())
}

function p2pkhFromPublicKey(publicKeyHex: string): string {
  return new P2PKH().lock(PublicKey.fromString(publicKeyHex).toHash()).toHex()
}

export function assertCanBuy(
  input: BuyInput,
  payer: string,
  owner = payer,
  existing: ProfileRecord[] = []
): PreparedProfile {
  if (!isCategory(input.category)) throw new Error('Pick a category.')
  const name = assertName(input.name)
  const blurb = assertBlurb(input.blurb)
  const link = assertLink(input.link)
  const desk = input.desk.trim() || payer
  if (!isIdentityKey(desk)) throw new Error('Desk key must be an identity key, or leave it blank.')
  if (!isIdentityKey(owner)) throw new Error('Owner identity is missing.')
  if (!isIdentityKey(payer)) throw new Error('Owner identity is missing.')
  const key = profileCollisionKey(owner, name)
  const taken = admitProfiles(existing).some((row) => profileCollisionKey(row.owner, row.name) === key)
  if (taken) throw new Error(DUPLICATE_PROFILE)
  return {
    category: input.category,
    name,
    blurb,
    link,
    owner,
    desk,
    profileFeeSats: PROFILE_FEE_SATS
  }
}

export function assertCanBoost(profile: ProfileRecord, ownerKey: string, pack: string): {
  pack: BoostPack
  hours: number
  paidSats: number
} {
  if (!isOwner(profile, ownerKey)) throw new Error(NOT_OWNER)
  if (!isBoostPack(pack)) throw new Error('Pick a 12-hour or 24-hour boost.')
  return quoteBoost(pack)
}

async function finishAction(
  wallet: WalletClient,
  response: Awaited<ReturnType<WalletClient['createAction']>>
): Promise<{ txid: string, tx: number[] }> {
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
  return { txid, tx }
}

export async function boostSigningKey(wallet: WalletClient): Promise<string> {
  const { publicKey } = await wallet.getPublicKey({
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return publicKey
}

async function signBoostBytes(wallet: WalletClient, data: number[]): Promise<string> {
  const { signature } = await wallet.createSignature({
    data,
    protocolID: PROTOCOL_ID,
    keyID: SIGNING_KEY_ID,
    counterparty: 'self'
  })
  return bytesToHex(signature)
}

async function overlayOrError(overlayUrl: string, tx: number[]): Promise<string | undefined> {
  try {
    await submitBoostTx(overlayUrl, tx)
    return undefined
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return detail.trim() || 'overlay submit failed with no message'
  }
}

export async function buyProfile(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: BuyInput,
  existing: ProfileRecord[] = []
): Promise<BuyResult> {
  const owner = await boostSigningKey(wallet)
  const ready = assertCanBuy(input, identityKey, owner, existing)
  const createdAt = nowIso()
  const profileId = profileBindingId({
    category: ready.category,
    name: ready.name,
    blurb: ready.blurb,
    link: ready.link,
    owner,
    desk: ready.desk,
    profileFeeSats: ready.profileFeeSats,
    createdAt
  })
  const signature = await signBoostBytes(wallet, canonicalProfileBytes({
    profileId,
    category: ready.category,
    name: ready.name,
    blurb: ready.blurb,
    link: ready.link,
    owner,
    desk: ready.desk,
    profileFeeSats: ready.profileFeeSats,
    createdAt
  }))
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeProfileFields({
        profileId,
        category: ready.category,
        name: ready.name,
        blurb: ready.blurb,
        link: ready.link,
        owner,
        desk: ready.desk,
        profileFeeSats: ready.profileFeeSats,
        createdAt,
        signature
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
    description: `Buy profile: ${ready.name}`,
    outputs: [
      {
        satoshis: ready.profileFeeSats,
        lockingScript: p2pkhFromPublicKey(ready.desk),
        outputDescription: `Profile fee for ${ready.name}`
      },
      {
        satoshis: ATTEST_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Profile receipt for ${ready.name}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          profileId
        }),
        tags: [BASKET, 'profile', profileId]
      }
    ],
    labels: [BASKET, 'profile'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  void nudgeBoost(wallet, identityKey, [ready.desk], {
    kind: 'profile',
    profileId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return {
    profileId,
    txid,
    profileFeeSats: ready.profileFeeSats,
    overlayError
  }
}

export async function buyBoost(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  profile: ProfileRecord,
  pack: BoostPack
): Promise<BoostResult> {
  const owner = await boostSigningKey(wallet)
  const quote = assertCanBoost(profile, owner, pack)
  const startsAt = nowIso()
  const endsAt = endsAtFrom(startsAt, quote.hours)
  const boostId = makeBoostId(profile.profileId, owner, pack, startsAt, randomNonce())
  const signature = await signBoostBytes(wallet, canonicalBoostBytes({
    profileId: profile.profileId,
    boostId,
    owner,
    pack,
    hours: quote.hours,
    paidSats: quote.paidSats,
    startsAt,
    endsAt
  }))
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeBoostFields({
        profileId: profile.profileId,
        boostId,
        owner,
        pack,
        hours: quote.hours,
        paidSats: quote.paidSats,
        startsAt,
        endsAt,
        signature
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
    description: `Buy boost: ${profile.name} (${pack})`,
    outputs: [
      {
        satoshis: quote.paidSats,
        lockingScript: p2pkhFromPublicKey(profile.desk),
        outputDescription: `Boost pack (${pack}) for ${profile.name}`
      },
      {
        satoshis: ATTEST_SATS,
        lockingScript: lockingScript.toHex(),
        outputDescription: `Boost receipt for ${profile.name}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self',
          profileId: profile.profileId,
          boostId
        }),
        tags: [BASKET, 'boost', profile.profileId]
      }
    ],
    labels: [BASKET, 'boost'],
    options: { randomizeOutputs: false }
  })

  const { txid, tx } = await finishAction(wallet, response)
  void nudgeBoost(wallet, identityKey, [profile.desk], {
    kind: 'boost',
    profileId: profile.profileId,
    boostId,
    txid
  })
  const overlayError = await overlayOrError(overlayUrl, tx)
  return {
    profileId: profile.profileId,
    boostId,
    txid,
    pack,
    paidSats: quote.paidSats,
    endsAt,
    overlayError
  }
}

export function downloadReading(reading: BoostReading): void {
  const blob = new Blob([JSON.stringify(reading, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${readingSlug(reading.name)}-reading.json`
  anchor.click()
  URL.revokeObjectURL(url)
}

export function readingFor(
  profile: ProfileRecord,
  boosts: BoostRecord[],
  nowMs = Date.now()
): BoostReading {
  return buildReading(profile, boosts, nowMs, nowIso())
}
