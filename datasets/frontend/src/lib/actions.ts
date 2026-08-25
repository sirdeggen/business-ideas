import {
  P2PKH,
  PublicKey,
  PushDrop,
  Utils,
  WalletClient
} from '@bsv/sdk'
import {
  BASKET,
  BRC29_PROTOCOL,
  MAGIC,
  PROTOCOL_ID,
  SCHEMA_VERSION,
  encodeListingFields,
  encodeReceiptFields,
  formatSats,
  isIdentityKey,
  makeListingId,
  sampleHashOf,
  validateListing,
  validatePrice,
  type DatasetListing
} from '../../../protocol/dataset'
import { originator } from './config'
import { submitDatasetTx, type OverlayListing } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface PostInput {
  title: string
  license: string
  dump: string
  priceSats: number
}

export interface PostResult {
  listingId: string
  txid: string
  sampleHash: string
  overlayError?: string
}

export interface BuyResult {
  payTxid: string
  paidSats: number
  dump: string
  title: string
  license: string
  sampleHash: string
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

function nowIso(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function hashShort(value: string): string {
  return value.length > 16 ? `${value.slice(0, 10)}…` : value
}

export function listingPriceSats(listing: Pick<DatasetListing, 'priceSats'>): number {
  return listing.priceSats
}

export { formatSats }

export function assertCanPost(input: PostInput): void {
  if (!input.title.trim()) throw new Error('Title is required.')
  if (!input.license.trim()) throw new Error('License is required.')
  if (!input.dump.trim()) throw new Error('Write a small dump before listing.')
  const priceError = validatePrice(input.priceSats)
  if (priceError) throw new Error(priceError)
}

async function brc29PaymentOutput(
  wallet: WalletClient,
  payee: string,
  satoshis: number
): Promise<{
  satoshis: number
  lockingScript: string
  outputDescription: string
  customInstructions: string
}> {
  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: payee,
    forSelf: false
  })
  const lockingScript = new P2PKH().lock(PublicKey.fromString(publicKey).toHash())
  return {
    satoshis,
    lockingScript: lockingScript.toHex(),
    outputDescription: `Dump payment ${formatSats(satoshis)}`,
    customInstructions: JSON.stringify({
      derivationPrefix,
      derivationSuffix,
      payee
    })
  }
}

export async function postListing(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: PostInput
): Promise<PostResult> {
  assertCanPost(input)
  const timestamp = nowIso()
  const dump = input.dump
  const sampleHash = sampleHashOf(dump)
  const listingId = makeListingId(identityKey, input.title.trim(), timestamp, randomNonce())
  const listing: Omit<DatasetListing, 'magic' | 'version' | 'kind'> = {
    listingId,
    seller: identityKey,
    title: input.title.trim(),
    license: input.license.trim(),
    sampleHash,
    priceSats: input.priceSats,
    dump,
    timestamp
  }
  const invalid = validateListing({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'listing',
    ...listing
  })
  if (invalid) throw new Error(invalid)

  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeListingFields(listing),
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
    description: `Post listing: ${listing.title}`,
    outputs: [{
      satoshis: 1,
      lockingScript: lockingScript.toHex(),
      outputDescription: listing.title,
      basket: BASKET,
      customInstructions: JSON.stringify({
        protocolID: PROTOCOL_ID,
        keyID,
        counterparty: 'self'
      }),
      tags: [BASKET, 'listing', listingId]
    }],
    labels: [BASKET, 'post'],
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
    throw Object.assign(new Error('Wallet did not return a listing transaction'), { cause: response })
  }

  try {
    await submitDatasetTx(overlayUrl, tx)
    return { listingId, txid, sampleHash }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      listingId,
      txid,
      sampleHash,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export async function buyDump(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  listing: OverlayListing
): Promise<BuyResult> {
  if (!isIdentityKey(listing.seller)) {
    throw new Error('This listing has no seller to pay.')
  }
  const paidSats = listing.priceSats
  const priceError = validatePrice(paidSats)
  if (priceError) throw new Error(priceError)

  const keyID = randomKeyId()
  const receiptScript = await withTimeout(
    pushdrop(wallet).lock(
      encodeReceiptFields({
        listingId: listing.listingId,
        buyer: identityKey,
        paidSats,
        sampleHash: listing.sampleHash,
        timestamp: nowIso()
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

  const payment = await brc29PaymentOutput(wallet, listing.seller, paidSats)
  const response = await wallet.createAction({
    description: `Buy dump: ${listing.title}`,
    outputs: [
      {
        satoshis: payment.satoshis,
        lockingScript: payment.lockingScript,
        outputDescription: payment.outputDescription,
        customInstructions: payment.customInstructions
      },
      {
        satoshis: 1,
        lockingScript: receiptScript.toHex(),
        outputDescription: `Receipt ${hashShort(listing.listingId)}`,
        basket: BASKET,
        customInstructions: JSON.stringify({
          protocolID: PROTOCOL_ID,
          keyID,
          counterparty: 'self'
        }),
        tags: [BASKET, 'receipt', listing.listingId]
      }
    ],
    labels: [BASKET, 'buy'],
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
    throw Object.assign(new Error('Wallet did not return a payment transaction'), { cause: response })
  }

  try {
    await submitDatasetTx(overlayUrl, tx)
    return {
      payTxid: txid,
      paidSats,
      dump: listing.dump,
      title: listing.title,
      license: listing.license,
      sampleHash: listing.sampleHash
    }
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return {
      payTxid: txid,
      paidSats,
      dump: listing.dump,
      title: listing.title,
      license: listing.license,
      sampleHash: listing.sampleHash,
      overlayError: detail.trim() || 'overlay submit failed with no message'
    }
  }
}

export function downloadDump(title: string, dump: string): void {
  const slug = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
  const blob = new Blob([dump], { type: 'text/plain' })
  const href = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = href
  link.download = `${slug || 'dump'}.txt`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(href)
}
