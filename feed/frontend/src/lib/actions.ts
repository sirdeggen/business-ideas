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
  activeSubscription,
  encodeFeedFields,
  encodePulseFields,
  encodeQueryFields,
  encodeReadingFields,
  encodeSubFields,
  expiresAt,
  isIdentityKey,
  isMetricType,
  makeFeedId,
  queryCharge,
  readingHash,
  validateLabel,
  validateListing,
  validatePulse,
  validateQuery,
  validateReading,
  validateReadingValue,
  validateSub,
  validateUnit,
  type FeedSub,
  type MetricType,
  type ReadingMode
} from '../../../protocol/feed'
import { originator } from './config'
import { pullDelivery, pullNotices, sendDelivery, sendQuery } from './messagebox'
import type { FeedRow } from './overlay'
import { submitFeedTx } from './overlay'
import { CONNECT_MS, CONNECT_TIMEOUT_MESSAGE, withTimeout } from './wallet'

export interface PublishInput {
  label: string
  metricType: MetricType
  unit: string
  value: string
  queryPriceSats: number
  subPriceSats: number
  subHours: number
}

export interface UpdateInput {
  value: string
}

export interface PublishResult {
  feedId: string
  txid: string
  valueHash: string
  overlayError?: string
}

export interface ReadingReceipt {
  label: string
  value: string
  unit: string
  paidSats: number
  mode: ReadingMode
  covered: boolean
  payTxid: string
  valueHash: string
  publisher: string
  waiting: boolean
  overlayError?: string
}

export interface HeldReading {
  feedId: string
  label: string
  metricType: MetricType
  value: string
  unit: string
  valueHash: string
  timestamp: string
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

export function parseWhole(raw: string): number | null {
  const trimmed = raw.trim()
  if (!/^\d+$/.test(trimmed)) return null
  const value = Number(trimmed)
  if (!Number.isSafeInteger(value)) return null
  return value
}

export function assertCanPublish(input: PublishInput): void {
  const labelError = validateLabel(input.label.trim())
  if (labelError) throw new Error('Label is required.')
  if (!isMetricType(input.metricType)) throw new Error('Pick a metric type.')
  const unitError = validateUnit(input.unit.trim())
  if (unitError) throw new Error('Unit is too long.')
  const valueError = validateReadingValue(input.value.trim())
  if (valueError) throw new Error('Write the current reading.')
  if (!Number.isInteger(input.queryPriceSats) || input.queryPriceSats < 1) {
    throw new Error('Enter a price.')
  }
  if (!Number.isInteger(input.subPriceSats) || input.subPriceSats < 0) {
    throw new Error('Subscription must be a whole number.')
  }
  if (input.subPriceSats > 0 && (!Number.isInteger(input.subHours) || input.subHours < 1 || input.subHours > 168)) {
    throw new Error('Open Advanced and set subscription hours.')
  }
}

export function assertCanUpdate(value: string): void {
  const valueError = validateReadingValue(value.trim())
  if (valueError) throw new Error('Write the fresh reading.')
}

function heldFromInstructions(raw: string | undefined): HeldReading | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<HeldReading>
    if (typeof parsed.feedId !== 'string' || typeof parsed.value !== 'string') return null
    if (typeof parsed.label !== 'string' || typeof parsed.metricType !== 'string') return null
    if (!isMetricType(parsed.metricType)) return null
    if (!parsed.value.trim()) return null
    return {
      feedId: parsed.feedId,
      label: parsed.label,
      metricType: parsed.metricType,
      value: parsed.value,
      unit: typeof parsed.unit === 'string' ? parsed.unit : '',
      valueHash: typeof parsed.valueHash === 'string' ? parsed.valueHash : '',
      timestamp: typeof parsed.timestamp === 'string' ? parsed.timestamp : ''
    }
  } catch {
    return null
  }
}

export async function readHeld(
  wallet: WalletClient,
  feedId: string,
  valueHash?: string
): Promise<HeldReading | null> {
  try {
    const listed = await wallet.listOutputs({
      basket: BASKET,
      includeCustomInstructions: true,
      limit: 200
    })
    const matches: HeldReading[] = []
    for (const output of listed.outputs ?? []) {
      const held = heldFromInstructions(output.customInstructions)
      if (!held || held.feedId !== feedId) continue
      if (valueHash && held.valueHash !== valueHash) continue
      matches.push(held)
    }
    matches.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return matches[0] ?? null
  } catch {
    return null
  }
}

async function resolveReading(
  wallet: WalletClient,
  feedId: string,
  valueHash: string
): Promise<HeldReading | null> {
  const held = await readHeld(wallet, feedId, valueHash)
  if (held) return held
  const delivered = await pullDelivery(wallet, feedId, valueHash)
  if (!delivered) return null
  return {
    feedId: delivered.feedId,
    label: delivered.label,
    metricType: delivered.metricType,
    value: delivered.value,
    unit: delivered.unit,
    valueHash: delivered.valueHash,
    timestamp: delivered.timestamp
  }
}

function instructions(keyID: string, held: HeldReading): string {
  return JSON.stringify({
    protocolID: PROTOCOL_ID,
    keyID,
    counterparty: 'self',
    ...held
  })
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
    outputDescription: 'Feed payment',
    customInstructions: JSON.stringify({
      derivationPrefix,
      derivationSuffix,
      payee
    })
  }
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
    await submitFeedTx(overlayUrl, tx)
    return undefined
  } catch (error) {
    const detail = error instanceof Error && error.message.trim() ? error.message : String(error ?? '')
    return detail.trim() || 'overlay submit failed with no message'
  }
}

function tokenOutput(
  hex: string,
  keyID: string,
  description: string,
  held: HeldReading | null,
  tag: string,
  feedId: string
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
    customInstructions: held
      ? instructions(keyID, held)
      : JSON.stringify({ protocolID: PROTOCOL_ID, keyID, counterparty: 'self' }),
    tags: [BASKET, tag, feedId]
  }
}

export async function postFeed(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  input: PublishInput
): Promise<PublishResult> {
  assertCanPublish(input)
  const timestamp = nowIso()
  const label = input.label.trim()
  const unit = input.unit.trim()
  const value = input.value.trim()
  const valueHash = readingHash({
    label,
    metricType: input.metricType,
    value,
    unit,
    timestamp
  })
  const feedId = makeFeedId(identityKey, label, timestamp, randomNonce())
  const subPriceSats = input.subPriceSats > 0 ? input.subPriceSats : 0
  const listing = {
    feedId,
    publisher: identityKey,
    label,
    metricType: input.metricType,
    unit,
    queryPriceSats: input.queryPriceSats,
    subPriceSats,
    subHours: subPriceSats > 0 ? input.subHours : 0,
    valueHash,
    timestamp
  }
  const invalid = validateListing({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'feed',
    ...listing
  })
  if (invalid) throw new Error(invalid)
  const held: HeldReading = {
    feedId,
    label,
    metricType: input.metricType,
    value,
    unit,
    valueHash,
    timestamp
  }
  const locked = await lock(wallet, encodeFeedFields(listing))
  const response = await wallet.createAction({
    description: `Publish feed: ${label}`,
    outputs: [tokenOutput(locked.hex, locked.keyID, label, held, 'feed', feedId)],
    labels: [BASKET, 'publish'],
    options: { randomizeOutputs: false }
  })
  const done = await finishAction(wallet, response)
  await sendDelivery(wallet, identityKey, held)
  const overlayError = await broadcast(overlayUrl, done.tx)
  return { feedId, txid: done.txid, valueHash, overlayError }
}

export async function postReading(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  row: FeedRow,
  input: UpdateInput
): Promise<PublishResult> {
  assertCanUpdate(input.value)
  if (row.feed.publisher.toLowerCase() !== identityKey.toLowerCase()) {
    throw new Error('This wallet didn’t publish that feed.')
  }
  const timestamp = nowIso()
  const value = input.value.trim()
  const valueHash = readingHash({
    label: row.feed.label,
    metricType: row.feed.metricType,
    value,
    unit: row.feed.unit,
    timestamp
  })
  const pulse = {
    feedId: row.feed.feedId,
    publisher: identityKey,
    valueHash,
    timestamp
  }
  const invalid = validatePulse({
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'pulse',
    ...pulse
  })
  if (invalid) throw new Error(invalid)
  const held: HeldReading = {
    feedId: row.feed.feedId,
    label: row.feed.label,
    metricType: row.feed.metricType,
    value,
    unit: row.feed.unit,
    valueHash,
    timestamp
  }
  const locked = await lock(wallet, encodePulseFields(pulse))
  const response = await wallet.createAction({
    description: `Post reading: ${row.feed.label}`,
    outputs: [tokenOutput(locked.hex, locked.keyID, row.feed.label, held, 'pulse', row.feed.feedId)],
    labels: [BASKET, 'reading'],
    options: { randomizeOutputs: false }
  })
  const done = await finishAction(wallet, response)
  await sendDelivery(wallet, identityKey, held)
  const overlayError = await broadcast(overlayUrl, done.tx)
  return { feedId: row.feed.feedId, txid: done.txid, valueHash, overlayError }
}

export async function fulfillQueries(wallet: WalletClient): Promise<void> {
  const notices = await pullNotices(wallet)
  for (const notice of notices) {
    if (notice.kind !== 'query') continue
    const held = await readHeld(wallet, notice.feedId)
    if (!held) continue
    await sendDelivery(wallet, notice.buyer, held)
  }
}

async function signSpend(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  row: FeedRow,
  held: HeldReading | null,
  paidSats: number,
  mode: ReadingMode,
  description: string,
  settle: boolean
): Promise<ReadingReceipt> {
  if (!isIdentityKey(row.feed.publisher)) throw new Error('This feed has no publisher to pay.')
  const timestamp = held?.timestamp ?? nowIso()
  const outputs: Array<ReturnType<typeof tokenOutput> | Awaited<ReturnType<typeof brc29PaymentOutput>>> = []
  if (settle && paidSats > 0) {
    outputs.push(await brc29PaymentOutput(wallet, row.feed.publisher, identityKey, paidSats))
  }
  if (held) {
    const reading = {
      feedId: row.feed.feedId,
      buyer: identityKey,
      label: held.label,
      metricType: held.metricType,
      value: held.value,
      unit: held.unit,
      paidSats,
      mode,
      valueHash: held.valueHash,
      timestamp: held.timestamp
    }
    const invalid = validateReading({
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'reading',
      ...reading
    })
    if (invalid) throw new Error(invalid)
    const locked = await lock(wallet, encodeReadingFields(reading))
    outputs.push(tokenOutput(locked.hex, locked.keyID, held.label, held, 'reading', row.feed.feedId))
  } else {
    const query = {
      feedId: row.feed.feedId,
      buyer: identityKey,
      paidSats,
      valueHash: row.valueHash,
      timestamp
    }
    const queryError = validateQuery({
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'query',
      ...query
    })
    if (queryError) throw new Error(queryError)
    const locked = await lock(wallet, encodeQueryFields(query))
    outputs.push(tokenOutput(locked.hex, locked.keyID, row.feed.label, null, 'query', row.feed.feedId))
  }
  const response = await wallet.createAction({
    description,
    outputs,
    labels: [BASKET, mode],
    options: { randomizeOutputs: false }
  })
  const done = await finishAction(wallet, response)
  const overlayError = await broadcast(overlayUrl, done.tx)
  return {
    label: row.feed.label,
    value: held?.value ?? '',
    unit: held?.unit ?? row.feed.unit,
    paidSats,
    mode,
    covered: mode === 'sub' && paidSats === 0,
    payTxid: done.txid,
    valueHash: held?.valueHash ?? row.valueHash,
    publisher: row.feed.publisher,
    waiting: !held,
    overlayError
  }
}

function asHeld(delivered: {
  feedId: string
  label: string
  metricType: MetricType
  value: string
  unit: string
  valueHash: string
  timestamp: string
}): HeldReading {
  return delivered
}

export async function queryFeed(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  row: FeedRow,
  subs: FeedSub[]
): Promise<ReadingReceipt> {
  const sub = activeSubscription(subs, identityKey, row.feed.feedId, Date.now())
  const charge = queryCharge(row.feed, sub)
  let held = await resolveReading(wallet, row.feed.feedId, row.valueHash)
  if (held && readingHash(held) !== row.valueHash) held = null

  if (held) {
    return signSpend(
      wallet,
      overlayUrl,
      identityKey,
      row,
      held,
      charge.paidSats,
      charge.mode,
      `Query ${row.feed.label}`,
      true
    )
  }

  if (charge.paidSats > 0) {
    const meter = await signSpend(
      wallet,
      overlayUrl,
      identityKey,
      row,
      null,
      charge.paidSats,
      charge.mode,
      `Query ${row.feed.label}`,
      true
    )
    await sendQuery(wallet, row.feed.publisher, row.feed.feedId, identityKey, meter.payTxid)
    const delivered = await pullDelivery(wallet, row.feed.feedId, row.valueHash)
    if (delivered && readingHash(delivered) === row.valueHash) {
      const signed = await signSpend(
        wallet,
        overlayUrl,
        identityKey,
        row,
        asHeld(delivered),
        charge.paidSats,
        charge.mode,
        `Reading ${row.feed.label}`,
        false
      )
      return {
        ...signed,
        paidSats: charge.paidSats,
        payTxid: meter.payTxid,
        covered: false,
        waiting: false,
        overlayError: signed.overlayError ?? meter.overlayError
      }
    }
    return meter
  }

  await sendQuery(wallet, row.feed.publisher, row.feed.feedId, identityKey, 'subscription')
  const delivered = await pullDelivery(wallet, row.feed.feedId, row.valueHash)
  if (delivered && readingHash(delivered) === row.valueHash) {
    return signSpend(
      wallet,
      overlayUrl,
      identityKey,
      row,
      asHeld(delivered),
      0,
      'sub',
      `Reading ${row.feed.label}`,
      false
    )
  }
  return {
    label: row.feed.label,
    value: '',
    unit: row.feed.unit,
    paidSats: 0,
    mode: 'sub',
    covered: true,
    payTxid: '',
    valueHash: row.valueHash,
    publisher: row.feed.publisher,
    waiting: true
  }
}

export async function subscribeFeed(
  wallet: WalletClient,
  overlayUrl: string,
  identityKey: string,
  row: FeedRow
): Promise<{ receipt: ReadingReceipt, sub: FeedSub }> {
  if (row.feed.subPriceSats < 1 || row.feed.subHours < 1) {
    throw new Error('This feed has no subscription.')
  }
  if (!isIdentityKey(row.feed.publisher)) throw new Error('This feed has no publisher to pay.')
  const timestamp = nowIso()
  const expires = expiresAt(timestamp, row.feed.subHours)
  const sub: FeedSub = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'sub',
    feedId: row.feed.feedId,
    buyer: identityKey,
    paidSats: row.feed.subPriceSats,
    expires,
    timestamp
  }
  const invalid = validateSub(sub)
  if (invalid) throw new Error(invalid)
  let held = await resolveReading(wallet, row.feed.feedId, row.valueHash)
  if (held && readingHash(held) !== row.valueHash) held = null
  const payment = await brc29PaymentOutput(wallet, row.feed.publisher, identityKey, row.feed.subPriceSats)
  const subLock = await lock(wallet, encodeSubFields(sub))
  const outputs: Array<ReturnType<typeof tokenOutput> | Awaited<ReturnType<typeof brc29PaymentOutput>>> = [
    payment,
    tokenOutput(subLock.hex, subLock.keyID, row.feed.label, null, 'sub', row.feed.feedId)
  ]
  if (held) {
    const reading = {
      feedId: row.feed.feedId,
      buyer: identityKey,
      label: held.label,
      metricType: held.metricType,
      value: held.value,
      unit: held.unit,
      paidSats: row.feed.subPriceSats,
      mode: 'sub' as const,
      valueHash: held.valueHash,
      timestamp: held.timestamp
    }
    const readingError = validateReading({
      magic: MAGIC,
      version: SCHEMA_VERSION,
      kind: 'reading',
      ...reading
    })
    if (readingError) throw new Error(readingError)
    const readingLock = await lock(wallet, encodeReadingFields(reading))
    outputs.push(tokenOutput(readingLock.hex, readingLock.keyID, held.label, held, 'reading', row.feed.feedId))
  }
  const response = await wallet.createAction({
    description: `Subscribe to ${row.feed.label}`,
    outputs,
    labels: [BASKET, 'sub'],
    options: { randomizeOutputs: false }
  })
  const done = await finishAction(wallet, response)
  let waiting = !held
  let overlayError = await broadcast(overlayUrl, done.tx)
  if (waiting) {
    await sendQuery(wallet, row.feed.publisher, row.feed.feedId, identityKey, done.txid)
    const delivered = await pullDelivery(wallet, row.feed.feedId, row.valueHash)
    if (delivered && readingHash(delivered) === row.valueHash) {
      const signed = await signSpend(
        wallet,
        overlayUrl,
        identityKey,
        row,
        asHeld(delivered),
        row.feed.subPriceSats,
        'sub',
        `Reading ${row.feed.label}`,
        false
      )
      held = {
        feedId: delivered.feedId,
        label: delivered.label,
        metricType: delivered.metricType,
        value: delivered.value,
        unit: delivered.unit,
        valueHash: delivered.valueHash,
        timestamp: delivered.timestamp
      }
      waiting = false
      overlayError = signed.overlayError ?? overlayError
    }
  }
  return {
    sub,
    receipt: {
      label: row.feed.label,
      value: held?.value ?? '',
      unit: held?.unit ?? row.feed.unit,
      paidSats: row.feed.subPriceSats,
      mode: 'sub',
      covered: false,
      payTxid: done.txid,
      valueHash: held?.valueHash ?? row.valueHash,
      publisher: row.feed.publisher,
      waiting,
      overlayError
    }
  }
}
