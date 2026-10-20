import {
  HTTPSOverlayBroadcastFacilitator,
  LookupResolver,
  PushDrop,
  TopicBroadcaster,
  Transaction,
  type LookupAnswer,
  type OverlayBroadcastFacilitator,
  type STEAK,
  type TaggedBEEF
} from '@bsv/sdk'
import {
  MAGIC,
  bookFromRecords,
  deskFromRecords,
  UNIX_LOCKTIME_MIN,
  isIsoDateTime,
  keepMagic,
  nowIso,
  parseMandateFields,
  type BookMandate,
  type DeskState,
  type MandatePayload,
  type TxClock
} from '../../../protocol/mandate'
import { PUBLIC_LOOKUP, PUBLIC_TOPIC } from './config'

export interface OverlayItem {
  payload: MandatePayload
  txid: string
  outputIndex: number
  /** Header time, or a host-asserted time. Never nLockTime. */
  txTime?: string
  /** `header` when a merkle proof matches a block header. `host` when the overlay host asserted the time. */
  txClock?: TxClock
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface MandateQuery {
  outpoint?: string
  mandateId?: string
  txid?: string
}

export interface OverlayPing {
  ok: boolean
  error?: string
}

function overlayUrl(base: string): string {
  return base.replace(/\/$/, '')
}

/** Public overlay only — tm_anytx / ls_anytx. Client-side MAGIC filter. */
export function overlayTopic(_base?: string): string {
  return PUBLIC_TOPIC
}

export function overlayLookupService(_base?: string): string {
  return PUBLIC_LOOKUP
}

class HostPinnedFacilitator implements OverlayBroadcastFacilitator {
  readonly host: string
  readonly allowHTTP: boolean

  constructor(host: string, allowHTTP: boolean) {
    this.host = host
    this.allowHTTP = allowHTTP
  }

  async send(_url: string, taggedBEEF: TaggedBEEF): Promise<STEAK> {
    return new HTTPSOverlayBroadcastFacilitator(undefined, this.allowHTTP).send(this.host, taggedBEEF)
  }
}

function createBroadcaster(host: string, topic: string): TopicBroadcaster {
  const allowHTTP = host.startsWith('http://')
  return new TopicBroadcaster([topic], {
    networkPreset: 'local',
    facilitator: new HostPinnedFacilitator(host, allowHTTP),
    requireAcknowledgmentFromAllHostsForTopics: [],
    requireAcknowledgmentFromAnyHostForTopics: 'any'
  })
}

function createResolver(host: string, service: string): LookupResolver {
  const allowHTTP = host.startsWith('http://')
  return new LookupResolver({
    networkPreset: allowHTTP ? 'local' : 'mainnet',
    hostOverrides: { [service]: [host] }
  })
}

export function txFromWalletBeef(beef: number[]): Transaction {
  try {
    return Transaction.fromAtomicBEEF(beef)
  } catch {
    return Transaction.fromBEEF(beef)
  }
}

function standardBeef(tx: Transaction): number[] {
  try {
    return tx.toBEEF()
  } catch {
    return tx.toBEEF(true)
  }
}

function parseScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): MandatePayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseMandateFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function mandateOutputIndexes(tx: Transaction): number[] {
  const indexes: number[] = []
  for (const [index, output] of tx.outputs.entries()) {
    if (parseScript(output.lockingScript)) indexes.push(index)
  }
  return indexes
}

function overlayErrorText(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message
  if (typeof error === 'string' && error.trim()) return error
  if (error && typeof error === 'object') {
    const record = error as { description?: unknown, message?: unknown }
    const description = typeof record.description === 'string' ? record.description : ''
    const message = typeof record.message === 'string' ? record.message : ''
    return [message, description].filter((part) => part.trim()).join(' — ')
  }
  return String(error ?? '')
}

async function submitBeefFallback(host: string, topic: string, beef: number[]): Promise<SubmitResult> {
  const tx = txFromWalletBeef(beef)
  const body = standardBeef(tx)
  const response = await fetch(`${host}/submit`, {
    method: 'POST',
    headers: {
      'content-type': 'application/octet-stream',
      'x-topics': JSON.stringify([topic])
    },
    body: Uint8Array.from(body)
  })
  const text = await response.text()
  if (!response.ok) {
    throw new Error(
      `POST ${host}/submit x-topics ${JSON.stringify([topic])} failed (${response.status}): ${text.slice(0, 300)}`
    )
  }
  let raw: unknown = text
  try {
    raw = JSON.parse(text) as unknown
  } catch {
    // Overlay may return empty or non-JSON on success.
  }
  return {
    admitted: mandateOutputIndexes(tx),
    raw,
    host,
    topic
  }
}

export async function submitMandateTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = txFromWalletBeef(beef)
  try {
    const overlay = createBroadcaster(host, topic)
    const result = await tx.broadcast(overlay)
    if (result.status === 'success') {
      return {
        admitted: mandateOutputIndexes(tx),
        raw: result,
        host,
        topic
      }
    }
    const description = 'description' in result ? result.description : ''
    throw new Error(description || `broadcast status ${result.status}`)
  } catch (error) {
    try {
      return await submitBeefFallback(host, topic, beef)
    } catch (fallbackError) {
      const first = overlayErrorText(error)
      const second = overlayErrorText(fallbackError)
      throw new Error(
        `Overlay submit to ${topic} at ${host} failed: ${second || first || 'no message from overlay/facilitator'}`
      )
    }
  }
}

async function postLookup(host: string, service: string, query: object): Promise<LookupAnswer> {
  const response = await fetch(`${host}/lookup`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ service, query })
  })
  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(
      `POST ${host}/lookup failed (${response.status})${text ? `: ${text.slice(0, 200)}` : ''}`
    )
  }
  return await response.json() as LookupAnswer
}

async function queryLookup(
  host: string,
  service: string,
  query: object,
  timeoutMs: number
): Promise<LookupAnswer> {
  try {
    return await postLookup(host, service, query)
  } catch (error) {
    const resolver = createResolver(host, service)
    try {
      return await resolver.query({ service, query }, timeoutMs)
    } catch {
      throw error
    }
  }
}

export function keepMandate(items: OverlayItem[]): OverlayItem[] {
  return keepMagic(items.map((item) => item.payload)).flatMap((payload) => {
    const item = items.find((row) => row.payload === payload)
    return item ? [item] : []
  })
}

function matchesQuery(item: OverlayItem, query: MandateQuery): boolean {
  if (item.payload.magic !== MAGIC) return false
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (item.txid !== txid || item.outputIndex !== Number(vout)) return false
  }
  if (query.mandateId && item.payload.mandateId !== query.mandateId) return false
  return true
}

export interface ListedMandate extends BookMandate {
  txid: string | null
}

function withChainTime(item: OverlayItem): MandatePayload {
  if (!item.txTime) return item.payload
  return { ...item.payload, txTime: item.txTime, ...(item.txClock ? { txClock: item.txClock } : {}) }
}

export function bookFromItems(items: OverlayItem[]): ListedMandate[] {
  const kept = keepMandate(items)
  return bookFromRecords(kept.map(withChainTime)).map((brand) => ({
    ...brand,
    txid: kept.find((item) => item.payload.kind === 'open' && item.payload.mandateId === brand.mandateId)?.txid ?? null
  }))
}

export function viewFromItems(items: OverlayItem[], mandateId?: string): DeskState | null {
  const scoped = keepMandate(items).filter((item) => !mandateId || item.payload.mandateId === mandateId)
  return deskFromRecords(scoped.map(withChainTime), mandateId)
}

const OVERLAY_TIME_KEYS = ['blockTime', 'broadcastTime', 'createdAt', 'admittedAt'] as const

function isoClock(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim().replace(/\.\d{3}Z$/, 'Z')
  return isIsoDateTime(trimmed) ? trimmed : null
}

/**
 * Host-asserted overlay time. The host states it. A merkle proof does not check it.
 * Prefer {@link headerTimeFromTx} when a block header is present.
 */
export function chainTimeFromOutput(output: {
  blockTime?: unknown
  broadcastTime?: unknown
  createdAt?: unknown
  admittedAt?: unknown
  context?: number[]
  blockHeader?: unknown
}): string | null {
  for (const key of OVERLAY_TIME_KEYS) {
    const found = isoClock(output[key])
    if (found) return found
  }
  if (!output.context || output.context.length === 0) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(output.context))) as Record<string, unknown>
    for (const key of OVERLAY_TIME_KEYS) {
      const found = isoClock(parsed[key])
      if (found) return found
    }
  } catch {
    return null
  }
  return null
}

async function queryAnytx(host: string, service: string, query: MandateQuery): Promise<LookupAnswer[]> {
  const answers: LookupAnswer[] = []
  const txid = query.txid || (query.outpoint ? query.outpoint.split('.')[0] : undefined)
  if (txid) answers.push(await queryLookup(host, service, { txid }, 20000))

  const pageSize = 100
  for (let page = 0; page < 5; page++) {
    const answer = await queryLookup(host, service, {
      limit: pageSize,
      skip: page * pageSize,
      sortOrder: 'desc'
    }, 20000)
    answers.push(answer)
    const count = answer.type === 'output-list' ? answer.outputs.length : 0
    if (count < pageSize) break
  }
  return answers
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim().toLowerCase()
  if (!/^[0-9a-f]*$/.test(clean) || clean.length % 2 !== 0) return null
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function headerBytes(value: unknown): Uint8Array | null {
  if (value instanceof Uint8Array && value.length === 80) return new Uint8Array(value)
  if (Array.isArray(value) && value.length === 80 && value.every((byte) => typeof byte === 'number')) {
    return Uint8Array.from(value)
  }
  if (typeof value !== 'string') return null
  const bytes = hexToBytes(value)
  return bytes?.length === 80 ? bytes : null
}

/** 80-byte header whose merkle root is `merkleRootHex` (display order) and whose time is `timestampSeconds`. */
export function blockHeaderForRoot(merkleRootHex: string, timestampSeconds: number): string {
  const root = hexToBytes(merkleRootHex)
  if (!root || root.length !== 32) throw new Error('Merkle root is missing.')
  if (!Number.isInteger(timestampSeconds) || timestampSeconds < UNIX_LOCKTIME_MIN) throw new Error('Header time is missing.')
  const header = new Uint8Array(80)
  const view = new DataView(header.buffer)
  view.setUint32(0, 1, true)
  header.set(root.slice().reverse(), 36)
  view.setUint32(68, timestampSeconds >>> 0, true)
  view.setUint32(72, 0x1d00ffff, true)
  return bytesToHex(header)
}

/**
 * Block header time when the tx's BEEF merkle proof computes the header's merkle root.
 * A proof without a header, or a header that does not match, is not a clock.
 */
export function headerTimeFromTx(tx: Transaction, blockHeader: unknown): string | null {
  const header = headerBytes(blockHeader)
  if (!header || !tx.merklePath) return null
  let root = ''
  try {
    root = tx.merklePath.computeRoot(tx.id('hex')).toLowerCase()
  } catch {
    return null
  }
  const embedded = bytesToHex(header.slice(36, 68).reverse())
  if (embedded !== root) return null
  const seconds = new DataView(header.buffer, header.byteOffset, header.byteLength).getUint32(68, true)
  if (!Number.isInteger(seconds) || seconds < UNIX_LOCKTIME_MIN) return null
  return nowIso(new Date(seconds * 1000))
}

/** Header time wins. Otherwise a host-asserted time. nLockTime is not read. */
export function publicationClock(
  tx: Transaction,
  hostTime: string | null,
  blockHeader?: unknown
): { txTime?: string, txClock?: TxClock } {
  const headerTime = headerTimeFromTx(tx, blockHeader)
  if (headerTime) return { txTime: headerTime, txClock: 'header' }
  const host = hostTime?.trim().replace(/\.\d{3}Z$/, 'Z') ?? ''
  if (isIsoDateTime(host)) return { txTime: host, txClock: 'host' }
  return {}
}

function blockHeaderValue(output: { blockHeader?: unknown, context?: number[] }): unknown {
  if (output.blockHeader) return output.blockHeader
  if (!output.context || output.context.length === 0) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(output.context))) as { blockHeader?: unknown }
    return parsed.blockHeader ?? null
  } catch {
    return null
  }
}

export interface LookupOutput {
  beef?: number[]
  txid?: string
  blockHeader?: unknown
  blockTime?: unknown
  broadcastTime?: unknown
  createdAt?: unknown
  admittedAt?: unknown
  context?: number[]
}

function itemsFromBeef(
  beef: number[] | undefined,
  txidHint?: string,
  hostTime?: string | null,
  blockHeader?: unknown
): OverlayItem[] {
  if (!beef || beef.length === 0) return []
  try {
    const tx = txFromWalletBeef(beef)
    const txid = txidHint || tx.id('hex')
    const clock = publicationClock(tx, hostTime ?? null, blockHeader)
    const rows: OverlayItem[] = []
    for (const [outputIndex, output] of tx.outputs.entries()) {
      const payload = parseScript(output.lockingScript)
      if (!payload) continue
      rows.push({ payload, txid, outputIndex, ...clock })
    }
    return rows
  } catch {
    return []
  }
}

/** Read mandate rows from one lookup output. Does not use nLockTime. */
export function itemsFromLookupOutput(output: LookupOutput): OverlayItem[] {
  const hostTime = chainTimeFromOutput(output)
  return itemsFromBeef(output.beef, output.txid, hostTime, blockHeaderValue(output))
}

function itemsFromAnswer(answer: LookupAnswer): OverlayItem[] {
  if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) return []
  const seen = new Set<string>()
  const rows: OverlayItem[] = []
  for (const output of answer.outputs) {
    const decoded = itemsFromLookupOutput(output as LookupOutput)
    for (const item of decoded) {
      const key = `${item.txid}.${item.outputIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(item)
    }
  }
  return rows
}

export async function lookupMandateItems(base: string, query: MandateQuery = {}): Promise<OverlayItem[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const answers = await queryAnytx(host, service, query)
  const items = answers.flatMap(itemsFromAnswer)
  return items.filter((item) => matchesQuery(item, query))
}

export async function lookupMandate(base: string, mandateId: string, txid?: string): Promise<DeskState | null> {
  const items = await lookupMandateItems(base, { mandateId, txid })
  return viewFromItems(items, mandateId)
}

function fetchFailure(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.trim() || /failed to fetch/i.test(message)) return `Failed to fetch ${path}`
  return `Failed to fetch ${path}: ${message}`
}

async function probeGet(host: string, path: string): Promise<OverlayPing> {
  try {
    const response = await fetch(`${host}${path}`)
    if (response.ok) return { ok: true }
    return { ok: false, error: `GET ${path} failed: ${response.status}` }
  } catch (error) {
    return { ok: false, error: fetchFailure(path, error) }
  }
}

function isLiveHealthBody(body: unknown): boolean {
  if (!body || typeof body !== 'object') return false
  const record = body as { status?: unknown, live?: unknown }
  return record.status === 'ok' && record.live === true
}

export async function pingOverlay(base: string): Promise<OverlayPing> {
  const host = overlayUrl(base)
  const errors: string[] = []
  const live = await probeGet(host, '/health/live')
  if (live.ok) return { ok: true }
  if (live.error) errors.push(live.error)
  try {
    const response = await fetch(`${host}/health`)
    if (response.ok) {
      const body = await response.json().catch(() => null)
      if (isLiveHealthBody(body)) return { ok: true }
      errors.push('GET /health did not report { status: ok, live: true }')
    } else {
      errors.push(`GET /health failed: ${response.status}`)
    }
  } catch (error) {
    errors.push(fetchFailure('/health', error))
  }
  const version = await probeGet(host, '/version')
  if (version.ok) return { ok: true }
  if (version.error) errors.push(version.error)
  return { ok: false, error: errors[0] ?? 'Overlay check failed' }
}
