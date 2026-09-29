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
  buildUsage,
  encodeOfferFields,
  encodePackFields,
  encodeUsageFields,
  isDemoOffer,
  isIdentityKey,
  makeOfferId,
  makePackId,
  meterRemaining,
  mockInference,
  packTotalFor,
  usageTimestamp,
  receiptsForPack,
  validateLabel,
  validateModel,
  validateOffer,
  validatePack,
  validatePrice,
  validatePrompt,
  validateUsage,
  type InferenceOffer,
  type InferencePack,
  type InferenceUsage
} from '../../../protocol/inference'
import { originator } from './config'
import { sendResponse } from './messagebox'
import type { OfferRow, OverlayPack } from './overlay'
import { submitInferenceTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface ListInput {
  label: string
  model: string
  callSats: number
  packSats: number
  packCalls: number
}

export interface CallInput {
  prompt: string
}

export interface ListResult {
  offerId: string
  txid: string
  overlayError?: string
}

export interface PackResult {
  pack: InferencePack
  txid: string
  overlayError?: string
}

export interface UsageResult {
  usage: InferenceUsage
  response: string
  txid: string
  remaining: number
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

let lastStamp: string | null = null

function nowIso(): string {
  lastStamp = usageTimestamp(lastStamp)
  return lastStamp
}

export function parseWhole(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) return null
  return value
}

export function assertCanList(input: ListInput): void {
  if (validateLabel(input.label.trim())) throw new Error('Label is required.')
  if (validateModel(input.model.trim())) throw new Error('Model is required.')
  if (validatePrice(input.callSats)) throw new Error('Enter a price.')
  if (validatePrice(input.packSats, true)) throw new Error('Pack price must be a whole number.')
  if (input.packSats > 0 && (!Number.isInteger(input.packCalls) || input.packCalls < 1)) {
    throw new Error('Enter how many calls are in the pack.')
  }
}

export function assertCanPrompt(prompt: string): void {
  if (validatePrompt(prompt)) throw new Error('Write a prompt.')
}

function beefBytes(tx: unknown): number[] | undefined {
  if (!tx) return undefined
  if (tx instanceof Uint8Array) return Array.from(tx)
  if (Array.isArray(tx) && tx.every((part) => typeof part === 'number')) return tx as number[]
  return undefined
}

async function finishAction(
  wallet: WalletClient,
  response: {
    txid?: string
    tx?: unknown
    signableTransaction?: { reference: string }
  }
): Promise<{ txid: string, tx: number[] }> {
  let txid = response.txid
  let tx = beefBytes(response.tx)
  if ((!txid || !tx) && response.signableTransaction) {
    const signed = await wallet.signAction({
      reference: response.signableTransaction.reference,
      spends: {}
    })
    txid = signed.txid
    tx = beefBytes(signed.tx)
  }
  if (!txid || !tx) {
    throw Object.assign(new Error('Wallet did not return a transaction'), { cause: response })
  }
  return { txid, tx }
}

async function broadcast(overlayUrl: string, tx: number[]): Promise<string | undefined> {
  try {
    await submitInferenceTx(overlayUrl, tx)
    return undefined
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return detail.trim() || 'overlay submit failed with no message'
  }
}

async function lock(wallet: WalletClient, fields: number[][]): Promise<{ hex: string, keyID: string }> {
  const keyID = randomKeyId()
  const lockingScript = await withTimeout(
    pushdrop(wallet).lock(fields, PROTOCOL_ID, keyID, 'self', true, false),
    CONNECT_MS,
    CONNECT_TIMEOUT_MESSAGE
  )
  return { hex: lockingScript.toHex(), keyID }
}

async function brc29PaymentOutput(
  wallet: WalletClient,
  payee: string,
  selfKey: string,
  satoshis: number
): Promise<{
  satoshis: number
  lockingScript: string
  outputDescription: string
  customInstructions: string
}> {
  const payingSelf = payee.toLowerCase() === selfKey.toLowerCase()
  const derivationPrefix = randomKeyId()
  const derivationSuffix = randomKeyId()
  const { publicKey } = await wallet.getPublicKey({
    protocolID: BRC29_PROTOCOL,
    keyID: `${derivationPrefix} ${derivationSuffix}`,
    counterparty: payingSelf ? 'self' : payee,
    forSelf: payingSelf
  })
  const lockingScript = new P2PKH().lock(PublicKey.fromString(publicKey).toHash())
  return {
    satoshis,
    lockingScript: lockingScript.toHex(),
    outputDescription: 'Inference payment',
    customInstructions: JSON.stringify({
      derivationPrefix,
      derivationSuffix,
      payee
    })
  }
}

function tokenOutput(
  hex: string,
  keyID: string,
  description: string,
  tag: string,
  offerId: string
): {
  satoshis: number
  lockingScript: string
  outputDescription: string
  basket: string
  customInstructions: string
  tags: string[]
} {
  return {
    satoshis: 1,
    lockingScript: hex,
    outputDescription: description,
    basket: BASKET,
    customInstructions: JSON.stringify({ protocolID: PROTOCOL_ID, keyID, counterparty: 'self' }),
    tags: [BASKET, tag, offerId]
  }
}

export function servedResponse(model: string, prompt: string): string {
  return mockInference(model, prompt.trim())
}

export function previewUsage(
  offer: InferenceOffer,
  pack: InferencePack,
  prior: InferenceUsage[],
  prompt: string,
  timestamp = nowIso()
): { usage: InferenceUsage, response: string } {
  const response = servedResponse(offer.model, prompt)
  const usage = buildUsage({
    offerId: offer.offerId,
    provider: offer.provider,
    buyer: pack.buyer,
    callSats: offer.callSats,
    pack,
    prior,
    prompt: prompt.trim(),
    response,
    timestamp
  })
  return { usage, response }
}

export async function listOffer(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: ListInput
): Promise<ListResult> {
  assertCanList(input)
  const timestamp = nowIso()
  const label = input.label.trim()
  const model = input.model.trim()
  const packSats = input.packSats > 0 ? input.packSats : 0
  const offer = {
    offerId: makeOfferId(identityKey, label, timestamp, randomNonce()),
    provider: identityKey,
    label,
    model,
    callSats: input.callSats,
    packSats,
    packCalls: packSats > 0 ? input.packCalls : 0,
    timestamp
  }
  const invalid = validateOffer({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'offer',
    ...offer
  })
  if (invalid) throw new Error(invalid)
  const locked = await lock(wallet, encodeOfferFields(offer))
  const response = await wallet.createAction({
    description: `List model: ${label}`,
    outputs: [tokenOutput(locked.hex, locked.keyID, label, 'offer', offer.offerId)],
    labels: [BASKET, 'offer'],
    options: { randomizeOutputs: false }
  })
  const done = await finishAction(wallet, response)
  const overlayError = await broadcast(overlayUrl, done.tx)
  return { offerId: offer.offerId, txid: done.txid, overlayError }
}

export async function buyPack(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  row: OfferRow
): Promise<PackResult> {
  if (isDemoOffer(row.offer)) throw new Error('List a model before buying a pack.')
  if (!isIdentityKey(row.offer.provider)) throw new Error('This model has no provider to pay.')
  if (row.offer.packSats < 1 || row.offer.packCalls < 1) throw new Error('This model has no pack.')
  const timestamp = nowIso()
  const pack: InferencePack = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'pack',
    packId: makePackId(identityKey, row.offer.offerId, timestamp, randomNonce()),
    offerId: row.offer.offerId,
    buyer: identityKey,
    provider: row.offer.provider,
    paidSats: row.offer.packSats,
    packTotal: packTotalFor(row.offer),
    timestamp
  }
  const invalid = validatePack(pack)
  if (invalid) throw new Error(invalid)
  const payment = await brc29PaymentOutput(wallet, row.offer.provider, identityKey, pack.paidSats)
  const locked = await lock(wallet, encodePackFields(pack))
  const response = await wallet.createAction({
    description: `Buy pack: ${row.offer.label}`,
    outputs: [
      payment,
      tokenOutput(locked.hex, locked.keyID, row.offer.label, 'pack', row.offer.offerId)
    ],
    labels: [BASKET, 'pack'],
    options: { randomizeOutputs: false }
  })
  const done = await finishAction(wallet, response)
  const overlayError = await broadcast(overlayUrl, done.tx)
  return { pack, txid: done.txid, overlayError }
}

function priorFor(
  usages: InferenceUsage[],
  pack: Pick<InferencePack, 'packId' | 'buyer'>
): InferenceUsage[] {
  return receiptsForPack(usages, pack.packId, pack.buyer)
}

export function packBalance(
  pack: Pick<InferencePack, 'packId' | 'packTotal' | 'buyer'>,
  usages: InferenceUsage[]
): number {
  return meterRemaining(pack.packTotal, priorFor(usages, pack))
}

async function publishUsage(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  offer: InferenceOffer,
  usage: InferenceUsage,
  responseText: string,
  paySats: number,
  description: string
): Promise<UsageResult> {
  const invalid = validateUsage(usage)
  if (invalid) throw new Error(invalid)
  const locked = await lock(wallet, encodeUsageFields(usage))
  const outputs: Array<ReturnType<typeof tokenOutput> | Awaited<ReturnType<typeof brc29PaymentOutput>>> = []
  if (paySats > 0) {
    outputs.push(await brc29PaymentOutput(wallet, offer.provider, identityKey, paySats))
  }
  outputs.push(tokenOutput(locked.hex, locked.keyID, offer.label, 'usage', offer.offerId))
  const response = await wallet.createAction({
    description,
    outputs,
    labels: [BASKET, 'usage'],
    options: { randomizeOutputs: false }
  })
  const done = await finishAction(wallet, response)
  await sendResponse(wallet, identityKey, {
    offerId: offer.offerId,
    requestHash: usage.requestHash,
    responseHash: usage.responseHash,
    response: responseText,
    timestamp: usage.timestamp
  })
  const overlayError = await broadcast(overlayUrl, done.tx)
  return {
    usage,
    response: responseText,
    txid: done.txid,
    remaining: usage.remaining,
    overlayError
  }
}

export async function payPerCall(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  row: OfferRow,
  input: CallInput
): Promise<UsageResult> {
  if (isDemoOffer(row.offer)) throw new Error('List a model before paying for a call.')
  if (!isIdentityKey(row.offer.provider)) throw new Error('This model has no provider to pay.')
  assertCanPrompt(input.prompt)
  const responseText = servedResponse(row.offer.model, input.prompt)
  const usage = buildUsage({
    offerId: row.offer.offerId,
    provider: row.offer.provider,
    buyer: identityKey,
    callSats: row.offer.callSats,
    pack: null,
    prior: [],
    prompt: input.prompt.trim(),
    response: responseText,
    timestamp: nowIso()
  })
  return publishUsage(
    wallet,
    overlayUrl,
    identityKey,
    row.offer,
    usage,
    responseText,
    row.offer.callSats,
    `Pay per call: ${row.offer.label}`
  )
}

export async function usePack(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  row: OfferRow,
  packs: OverlayPack[],
  usages: InferenceUsage[],
  input: CallInput
): Promise<UsageResult> {
  if (isDemoOffer(row.offer)) throw new Error('List a model before using a pack.')
  assertCanPrompt(input.prompt)
  const mine = packs.filter((pack) => (
    pack.offerId === row.offer.offerId && pack.buyer.toLowerCase() === identityKey.toLowerCase()
  ))
  const open = mine
    .map((pack) => ({ pack, remaining: packBalance(pack, usages) }))
    .filter((item) => item.remaining >= row.offer.callSats)
    .sort((a, b) => b.pack.timestamp.localeCompare(a.pack.timestamp))[0]
  if (!open) throw new Error('Buy a pack first.')
  const responseText = servedResponse(row.offer.model, input.prompt)
  const usage = buildUsage({
    offerId: row.offer.offerId,
    provider: row.offer.provider,
    buyer: identityKey,
    callSats: row.offer.callSats,
    pack: open.pack,
    prior: priorFor(usages, open.pack),
    prompt: input.prompt.trim(),
    response: responseText,
    timestamp: nowIso()
  })
  return publishUsage(
    wallet,
    overlayUrl,
    identityKey,
    row.offer,
    usage,
    responseText,
    0,
    `Use pack: ${row.offer.label}`
  )
}
