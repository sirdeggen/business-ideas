/**
 * Inference Desk protocol (PushDrop / BRC-48 fields).
 *
 * A provider lists a model. A buyer pays per call or buys a credit pack.
 * The provider serves an inference. The overlay row stores the request hash,
 * the response hash, the sats, and the remaining balance — not the plaintext.
 * Meter = pack total − sum(usage receipts). Not a signed market reading
 * (feed) and not a file listing (datasets).
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'inference']
export const BRC29_PROTOCOL: [2, string] = [2, '3241645161d8']
export const BASKET = 'inference'
export const TOPIC = 'tm_anytx'
export const LOOKUP_SERVICE = 'ls_anytx'
export const MAGIC = 'inference'
export const SCHEMA_VERSION = '1'
export const MESSAGE_BOX = 'inference'
export const MESSAGE_BOX_HOST = 'https://gmb.bsvblockchain.tech'
export const LABEL_MAX = 80
export const MODEL_MAX = 40
export const PROMPT_MAX = 480
export const RESPONSE_MAX = 480
export const PRICE_MIN = 1
export const PRICE_MAX = 100_000_000
export const PACK_CALLS_MAX = 1000
export const GENESIS = '0'.repeat(64)

export const DEMO_PROVIDER = `02${'ab'.repeat(32)}`
export const DEMO_BUYER = `03${'cd'.repeat(32)}`
export const DEMO_TIMESTAMP = '2026-09-29T00:00:00Z'
export const DEMO_LABEL = 'Desk note'
export const DEMO_MODEL = 'desk-note'
export const DEMO_CALL_SATS = 1000
export const DEMO_PACK_SATS = 4000
export const DEMO_PACK_CALLS = 5

export const KINDS = ['offer', 'pack', 'usage'] as const
export type InferenceKind = (typeof KINDS)[number]

export interface InferenceOffer {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'offer'
  offerId: string
  provider: string
  label: string
  model: string
  callSats: number
  packSats: number
  packCalls: number
  timestamp: string
}

export interface InferencePack {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'pack'
  packId: string
  offerId: string
  buyer: string
  provider: string
  paidSats: number
  packTotal: number
  timestamp: string
}

export interface InferenceUsage {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'usage'
  usageId: string
  offerId: string
  packId: string
  buyer: string
  provider: string
  requestHash: string
  responseHash: string
  sats: number
  remaining: number
  attestation: string
  prevHash: string
  timestamp: string
}

export type InferencePayload = InferenceOffer | InferencePack | InferenceUsage

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const HASH_HEX = /^[0-9a-f]{64}$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z)?$/

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isHashHex(value: string): boolean {
  return HASH_HEX.test(value)
}

export function isOfferId(value: string): boolean {
  return HASH_HEX.test(value.trim())
}

export function requestDigest(prompt: string): string {
  return sha256Hex(prompt)
}

export function responseDigest(response: string): string {
  return sha256Hex(response)
}

/** Attestation commits the provider key, the request hash, and the response hash. */
export function attestationFor(input: {
  provider: string
  requestHash: string
  responseHash: string
}): string {
  return sha256Hex([
    MAGIC,
    input.provider.trim().toLowerCase(),
    input.requestHash,
    input.responseHash
  ].join('\n'))
}

export function usageReceiptHash(input: {
  offerId: string
  packId: string
  buyer: string
  requestHash: string
  responseHash: string
  sats: number
  remaining: number
  attestation: string
  prevHash: string
  timestamp: string
}): string {
  return sha256Hex([
    MAGIC,
    input.offerId,
    input.packId,
    input.buyer.trim().toLowerCase(),
    input.requestHash,
    input.responseHash,
    String(input.sats),
    String(input.remaining),
    input.attestation,
    input.prevHash,
    input.timestamp
  ].join('\n'))
}

export function makeOfferId(
  provider: string,
  label: string,
  timestamp: string,
  nonce: string
): string {
  return sha256Hex([MAGIC, provider, label, timestamp, nonce].join('\n'))
}

export function makePackId(
  buyer: string,
  offerId: string,
  timestamp: string,
  nonce: string
): string {
  return sha256Hex([MAGIC, 'pack', buyer, offerId, timestamp, nonce].join('\n'))
}

export function packTotalFor(offer: Pick<InferenceOffer, 'callSats' | 'packCalls'>): number {
  return offer.callSats * offer.packCalls
}

/**
 * Second-resolution stamp. A later receipt in the same second gets the next
 * fraction so the two still sort in call order.
 */
export function usageTimestamp(previous: string | null, now = new Date()): string {
  const second = now.toISOString().slice(0, 19)
  const base = `${second}Z`
  if (!previous || !previous.startsWith(second)) return base
  const match = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,3}))?Z$/.exec(previous)
  const frac = match?.[1] ? Number(match[1].padEnd(3, '0')) : 0
  const next = Math.min(999, frac + 1)
  return `${second}.${String(next).padStart(3, '0')}Z`
}

/** Collapse the same usageId so a local copy and an overlay copy are one receipt. */
export function dedupeUsages<T extends { usageId: string }>(usages: T[]): T[] {
  const byId = new Map<string, T>()
  for (const usage of usages) {
    if (!byId.has(usage.usageId)) byId.set(usage.usageId, usage)
  }
  return [...byId.values()]
}

/**
 * Meter = pack total − sum(receipts). The same usageId counts once.
 * The balance never goes below zero.
 */
export function meterRemaining(
  packTotal: number,
  receipts: Array<{ sats: number, usageId?: string }>
): number {
  const seen = new Set<string>()
  let spent = 0
  for (const row of receipts) {
    if (row.usageId) {
      if (seen.has(row.usageId)) continue
      seen.add(row.usageId)
    }
    spent += row.sats
  }
  const remaining = packTotal - spent
  return remaining > 0 ? remaining : 0
}

/**
 * v0 provider. Deterministic, in-browser, no model server.
 * Swap this for a hosted model later; the hash and the meter stay the same.
 */
export function mockInference(model: string, prompt: string): string {
  const clipped = prompt.trim().replace(/\s+/g, ' ').slice(0, 240)
  return `${model}: ${clipped}`
}

export function demoOffer(): InferenceOffer {
  const offerId = makeOfferId(DEMO_PROVIDER, DEMO_LABEL, DEMO_TIMESTAMP, 'demo')
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'offer',
    offerId,
    provider: DEMO_PROVIDER,
    label: DEMO_LABEL,
    model: DEMO_MODEL,
    callSats: DEMO_CALL_SATS,
    packSats: DEMO_PACK_SATS,
    packCalls: DEMO_PACK_CALLS,
    timestamp: DEMO_TIMESTAMP
  }
}

export function demoPack(): InferencePack {
  const offer = demoOffer()
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'pack',
    packId: makePackId(DEMO_BUYER, offer.offerId, DEMO_TIMESTAMP, 'demo'),
    offerId: offer.offerId,
    buyer: DEMO_BUYER,
    provider: DEMO_PROVIDER,
    paidSats: DEMO_PACK_SATS,
    packTotal: packTotalFor(offer),
    timestamp: DEMO_TIMESTAMP
  }
}

export function isDemoOffer(offer: Pick<InferenceOffer, 'provider'>): boolean {
  return offer.provider.toLowerCase() === DEMO_PROVIDER.toLowerCase()
}

function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

function magicIndex(fields: Array<number[] | Uint8Array>): number {
  return fields.findIndex((field) => {
    try {
      return fieldUtf8(field) === MAGIC
    } catch {
      return false
    }
  })
}

function textFields(parts: string[]): number[][] {
  return parts.map((part) => stringToUtf8Bytes(part))
}

export function encodeOfferFields(
  item: Omit<InferenceOffer, 'magic' | 'version' | 'kind'>
): number[][] {
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'offer',
    item.offerId,
    item.provider,
    item.label,
    item.model,
    String(item.callSats),
    String(item.packSats),
    String(item.packCalls),
    item.timestamp
  ])
}

export function encodePackFields(
  item: Omit<InferencePack, 'magic' | 'version' | 'kind'>
): number[][] {
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'pack',
    item.packId,
    item.offerId,
    item.buyer,
    item.provider,
    String(item.paidSats),
    String(item.packTotal),
    item.timestamp
  ])
}

export function encodeUsageFields(
  item: Omit<InferenceUsage, 'magic' | 'version' | 'kind'>
): number[][] {
  return textFields([
    MAGIC,
    SCHEMA_VERSION,
    'usage',
    item.usageId,
    item.offerId,
    item.packId,
    item.buyer,
    item.provider,
    item.requestHash,
    item.responseHash,
    String(item.sats),
    String(item.remaining),
    item.attestation,
    item.prevHash,
    item.timestamp
  ])
}

function at(fields: Array<number[] | Uint8Array>, index: number): string {
  return fieldUtf8(fields[index])
}

export function isIsoTime(value: string): boolean {
  if (!ISO_TIME.test(value)) return false
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value)
  return !Number.isNaN(date.getTime())
}

export function validatePrice(sats: number, allowZero = false): string | null {
  if (!Number.isInteger(sats)) return 'price must be a whole number of sats'
  if (sats < (allowZero ? 0 : PRICE_MIN)) {
    return allowZero ? 'price must be zero or more' : 'price must be at least 1 sat'
  }
  if (sats > PRICE_MAX) return 'price is too high for v0'
  return null
}

export function validateLabel(label: string): string | null {
  if (label.trim().length < 1) return 'label is required'
  if (label.length > LABEL_MAX) return 'label too long'
  if (label.includes('\n')) return 'label must be one line'
  return null
}

export function validateModel(model: string): string | null {
  if (model.trim().length < 1) return 'model is required'
  if (model.length > MODEL_MAX) return 'model too long'
  if (model.includes('\n')) return 'model must be one line'
  return null
}

export function validatePrompt(prompt: string): string | null {
  if (prompt.trim().length < 1) return 'prompt is required'
  if (prompt.length > PROMPT_MAX) return 'prompt is too long for v0'
  return null
}

export function validateResponse(response: string): string | null {
  if (response.trim().length < 1) return 'response is required'
  if (response.length > RESPONSE_MAX) return 'response is too long for v0'
  return null
}

export function validateOffer(item: InferenceOffer): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'offer') return 'kind must be offer'
  if (!isHashHex(item.offerId)) return 'offer id must be 64 hex chars'
  if (!isIdentityKey(item.provider)) return 'provider must be an identity key'
  const labelError = validateLabel(item.label)
  if (labelError) return labelError
  const modelError = validateModel(item.model)
  if (modelError) return modelError
  const callError = validatePrice(item.callSats)
  if (callError) return callError
  const packError = validatePrice(item.packSats, true)
  if (packError) return packError
  if (!Number.isInteger(item.packCalls) || item.packCalls < 0 || item.packCalls > PACK_CALLS_MAX) {
    return 'pack size is not valid'
  }
  if (item.packSats === 0 && item.packCalls !== 0) return 'a pack price is required'
  if (item.packSats > 0 && item.packCalls < 1) return 'a pack needs at least one call'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validatePack(item: InferencePack): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'pack') return 'kind must be pack'
  if (!isHashHex(item.packId)) return 'pack id must be 64 hex chars'
  if (!isHashHex(item.offerId)) return 'offer id must be 64 hex chars'
  if (!isIdentityKey(item.buyer)) return 'buyer must be an identity key'
  if (!isIdentityKey(item.provider)) return 'provider must be an identity key'
  const paidError = validatePrice(item.paidSats)
  if (paidError) return paidError
  const totalError = validatePrice(item.packTotal)
  if (totalError) return totalError
  if (item.packTotal < item.paidSats) return 'pack total is below what was paid'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export function validateUsage(item: InferenceUsage): string | null {
  if (item.magic !== MAGIC) return 'wrong magic'
  if (item.version !== SCHEMA_VERSION) return 'unsupported schema version'
  if (item.kind !== 'usage') return 'kind must be usage'
  if (!isHashHex(item.usageId)) return 'usage id must be 64 hex chars'
  if (!isHashHex(item.offerId)) return 'offer id must be 64 hex chars'
  if (!isHashHex(item.packId)) return 'pack id must be 64 hex chars'
  if (!isIdentityKey(item.buyer)) return 'buyer must be an identity key'
  if (!isIdentityKey(item.provider)) return 'provider must be an identity key'
  if (!isHashHex(item.requestHash)) return 'request hash must be 64 hex chars'
  if (!isHashHex(item.responseHash)) return 'response hash must be 64 hex chars'
  if (!Number.isInteger(item.sats) || item.sats < PRICE_MIN || item.sats > PRICE_MAX) {
    return 'usage must record a whole number of sats'
  }
  if (!Number.isInteger(item.remaining) || item.remaining < 0 || item.remaining > PRICE_MAX) {
    return 'remaining balance is not valid'
  }
  if (item.packId === GENESIS && item.remaining !== 0) return 'a per-call receipt has no remaining balance'
  if (!isHashHex(item.attestation)) return 'attestation must be 64 hex chars'
  if (!isHashHex(item.prevHash)) return 'previous receipt must be 64 hex chars'
  const expectedAttestation = attestationFor(item)
  if (item.attestation !== expectedAttestation) return 'attestation does not match the response hash'
  const expectedId = usageReceiptHash(item)
  if (item.usageId !== expectedId) return 'usage receipt hash does not match'
  if (!isIsoTime(item.timestamp)) return 'timestamp must be ISO-8601'
  return null
}

export interface BuildUsageInput {
  offerId: string
  provider: string
  buyer: string
  callSats: number
  pack: Pick<InferencePack, 'packId' | 'packTotal'> | null
  prior: Array<Pick<InferenceUsage, 'usageId' | 'sats' | 'timestamp' | 'prevHash'>>
  prompt: string
  response: string
  timestamp: string
}

function receiptTip(
  prior: Array<Pick<InferenceUsage, 'usageId' | 'timestamp' | 'prevHash'>>,
  anchor: string
): Pick<InferenceUsage, 'usageId' | 'timestamp' | 'prevHash'> | undefined {
  if (prior.length === 0) return undefined
  const byPrev = new Map<string, (typeof prior)[number]>()
  const ordered = [...prior].sort((a, b) => (
    a.timestamp.localeCompare(b.timestamp) || a.usageId.localeCompare(b.usageId)
  ))
  for (const row of ordered) {
    if (!byPrev.has(row.prevHash)) byPrev.set(row.prevHash, row)
  }
  let cursor = anchor
  let tip: (typeof prior)[number] | undefined
  const seen = new Set<string>()
  while (!seen.has(cursor)) {
    const next = byPrev.get(cursor)
    if (!next) break
    seen.add(cursor)
    tip = next
    cursor = next.usageId
  }
  if (tip) return tip
  return ordered[ordered.length - 1]
}

export function buildUsage(input: BuildUsageInput): InferenceUsage {
  const promptError = validatePrompt(input.prompt)
  if (promptError) throw new Error(promptError)
  const responseError = validateResponse(input.response)
  if (responseError) throw new Error(responseError)
  const priceError = validatePrice(input.callSats)
  if (priceError) throw new Error(priceError)
  const requestHash = requestDigest(input.prompt)
  const responseHash = responseDigest(input.response)
  const prior = dedupeUsages(input.prior)
  const spent = prior.reduce((sum, row) => sum + row.sats, 0)
  const remaining = input.pack ? input.pack.packTotal - spent - input.callSats : 0
  if (input.pack && remaining < 0) throw new Error('pack balance is too low')
  const anchor = input.pack ? input.pack.packId : GENESIS
  const tip = receiptTip(prior, anchor)
  const prevHash = tip ? tip.usageId : anchor
  const packId = input.pack ? input.pack.packId : GENESIS
  const attestation = attestationFor({
    provider: input.provider,
    requestHash,
    responseHash
  })
  const usageId = usageReceiptHash({
    offerId: input.offerId,
    packId,
    buyer: input.buyer,
    requestHash,
    responseHash,
    sats: input.callSats,
    remaining,
    attestation,
    prevHash,
    timestamp: input.timestamp
  })
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'usage',
    usageId,
    offerId: input.offerId,
    packId,
    buyer: input.buyer,
    provider: input.provider,
    requestHash,
    responseHash,
    sats: input.callSats,
    remaining,
    attestation,
    prevHash,
    timestamp: input.timestamp
  }
}

export function verifyResponseHash(response: string, responseHash: string): boolean {
  return responseDigest(response) === responseHash.toLowerCase()
}

/**
 * Recompute sha256(response), check the attestation, and check the receipt
 * chain link plus the meter step against the previous receipt.
 */
export function verifyUsage(input: {
  response: string
  usage: InferenceUsage
  previous: InferenceUsage | null
  pack: InferencePack | null
}): string | null {
  const shape = validateUsage(input.usage)
  if (shape) return shape
  if (!verifyResponseHash(input.response, input.usage.responseHash)) {
    return 'response hash does not match the response'
  }
  const perCall = input.usage.packId === GENESIS
  if (perCall) {
    if (input.pack) return 'a per-call receipt is not on a pack'
    if (input.previous) return 'a per-call receipt does not chain'
    if (input.usage.prevHash !== GENESIS) return 'a per-call receipt must start at genesis'
    if (input.usage.remaining !== 0) return 'a per-call receipt has no remaining balance'
    return null
  }
  if (!input.pack || input.pack.packId !== input.usage.packId) return 'pack does not match the receipt'
  if (input.usage.buyer.toLowerCase() !== input.pack.buyer.toLowerCase()) {
    return 'receipt buyer does not match the pack'
  }
  if (input.previous) {
    if (input.previous.packId !== input.usage.packId) return 'receipt chain left the pack'
    if (input.usage.prevHash !== input.previous.usageId) return 'receipt chain does not link'
    if (input.usage.remaining !== input.previous.remaining - input.usage.sats) {
      return 'meter does not match the previous receipt'
    }
  } else {
    if (input.usage.prevHash !== input.pack.packId) return 'receipt chain must start at the pack'
    if (input.usage.remaining !== input.pack.packTotal - input.usage.sats) {
      return 'meter does not match the pack total'
    }
  }
  if (input.usage.remaining !== meterRemaining(input.pack.packTotal, [
    ...(input.previous
      ? [{ sats: input.pack.packTotal - input.previous.remaining }]
      : []),
    { sats: input.usage.sats }
  ])) {
    return 'meter does not match the pack total'
  }
  return null
}

export function verifyReceiptChain(
  pack: InferencePack,
  usages: InferenceUsage[],
  responses: Record<string, string> = {}
): string | null {
  const packError = validatePack(pack)
  if (packError) return packError
  const ordered = receiptsForPack(usages, pack.packId, pack.buyer)
  let previous: InferenceUsage | null = null
  for (const usage of ordered) {
    const response = responses[usage.responseHash] ?? responses[usage.usageId]
    if (response === undefined) return 'response is required to verify the hash'
    const error = verifyUsage({ response, usage, previous, pack })
    if (error) return error
    previous = usage
  }
  const expected = meterRemaining(pack.packTotal, ordered)
  if (previous && previous.remaining !== expected) return 'meter does not match the pack total'
  return null
}

/**
 * Receipts on this pack, one row per usageId, only the chain that links
 * from the pack id. A buyer, when given, drops everyone else's receipts.
 */
export function receiptsForPack(
  usages: InferenceUsage[],
  packId: string,
  buyer?: string
): InferenceUsage[] {
  const buyerKey = buyer?.trim().toLowerCase()
  const unique = dedupeUsages(usages.filter((usage) => {
    if (usage.packId !== packId) return false
    if (buyerKey && usage.buyer.toLowerCase() !== buyerKey) return false
    return true
  }))
  unique.sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.usageId.localeCompare(b.usageId))
  const byPrev = new Map<string, InferenceUsage>()
  for (const usage of unique) {
    if (!byPrev.has(usage.prevHash)) byPrev.set(usage.prevHash, usage)
  }
  const linked: InferenceUsage[] = []
  let prev = packId
  const seen = new Set<string>()
  while (byPrev.has(prev) && !seen.has(prev)) {
    seen.add(prev)
    const usage = byPrev.get(prev)!
    linked.push(usage)
    prev = usage.usageId
  }
  return linked
}

export function dedupeOffers<T extends Pick<InferenceOffer, 'offerId' | 'timestamp'>>(offers: T[]): T[] {
  const byId = new Map<string, T>()
  for (const offer of offers) {
    const prev = byId.get(offer.offerId)
    if (!prev || offer.timestamp > prev.timestamp) byId.set(offer.offerId, offer)
  }
  return [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

export function dedupePacks<T extends Pick<InferencePack, 'packId' | 'timestamp'>>(packs: T[]): T[] {
  const byId = new Map<string, T>()
  for (const pack of packs) {
    const prev = byId.get(pack.packId)
    if (!prev || pack.timestamp > prev.timestamp) byId.set(pack.packId, pack)
  }
  return [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
}

function offerFromFields(fields: Array<number[] | Uint8Array>, start: number): InferenceOffer | null {
  if (start + 10 >= fields.length) return null
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'offer',
    offerId: at(fields, start + 3).toLowerCase(),
    provider: at(fields, start + 4),
    label: at(fields, start + 5),
    model: at(fields, start + 6),
    callSats: Number(at(fields, start + 7)),
    packSats: Number(at(fields, start + 8)),
    packCalls: Number(at(fields, start + 9)),
    timestamp: at(fields, start + 10)
  }
}

function packFromFields(fields: Array<number[] | Uint8Array>, start: number): InferencePack | null {
  if (start + 9 >= fields.length) return null
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'pack',
    packId: at(fields, start + 3).toLowerCase(),
    offerId: at(fields, start + 4).toLowerCase(),
    buyer: at(fields, start + 5),
    provider: at(fields, start + 6),
    paidSats: Number(at(fields, start + 7)),
    packTotal: Number(at(fields, start + 8)),
    timestamp: at(fields, start + 9)
  }
}

function usageFromFields(fields: Array<number[] | Uint8Array>, start: number): InferenceUsage | null {
  if (start + 14 >= fields.length) return null
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'usage',
    usageId: at(fields, start + 3).toLowerCase(),
    offerId: at(fields, start + 4).toLowerCase(),
    packId: at(fields, start + 5).toLowerCase(),
    buyer: at(fields, start + 6),
    provider: at(fields, start + 7),
    requestHash: at(fields, start + 8).toLowerCase(),
    responseHash: at(fields, start + 9).toLowerCase(),
    sats: Number(at(fields, start + 10)),
    remaining: Number(at(fields, start + 11)),
    attestation: at(fields, start + 12).toLowerCase(),
    prevHash: at(fields, start + 13).toLowerCase(),
    timestamp: at(fields, start + 14)
  }
}

/** Accepts live lock() scripts where MAGIC is anywhere in the field list. */
export function parseInferenceFields(fields: Array<number[] | Uint8Array>): InferencePayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  try {
    if (at(fields, start) !== MAGIC) return null
    if (at(fields, start + 1) !== SCHEMA_VERSION) return null
    const kind = at(fields, start + 2)
    if (kind === 'offer') {
      const parsed = offerFromFields(fields, start)
      if (!parsed || validateOffer(parsed)) return null
      return parsed
    }
    if (kind === 'pack') {
      const parsed = packFromFields(fields, start)
      if (!parsed || validatePack(parsed)) return null
      return parsed
    }
    if (kind === 'usage') {
      const parsed = usageFromFields(fields, start)
      if (!parsed || validateUsage(parsed)) return null
      return parsed
    }
    return null
  } catch {
    return null
  }
}
