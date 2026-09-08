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
  LOOKUP_SERVICE,
  MAGIC,
  TOPIC,
  matchReceipts,
  parseTraceFields,
  selectReceipt,
  type TraceReceipt
} from '../../../protocol/trace'
import {
  PUBLIC_LOOKUP,
  PUBLIC_TOPIC,
  isLocalhostUrl
} from './config'
import { cacheReceipt, keepLastGoodReceipts, readCachedReceipt, readCachedReceipts } from './persist'

export interface OverlayItem {
  payload: TraceReceipt
  txid: string
  outputIndex: number
}

export interface OverlayReceipt extends TraceReceipt {
  txid: string
  outputIndex: number
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface TraceQuery {
  t?: string
  txid?: string
}

export interface TraceView {
  query: string
  receipt: OverlayReceipt | null
  matches: OverlayReceipt[]
  fromCache: boolean
}

function overlayUrl(base: string): string {
  return base.replace(/\/$/, '')
}

export function usesPublicAnytx(base: string): boolean {
  return !isLocalhostUrl(base)
}

/** Public and local both use tm_anytx — this desk does not invent a custom topic. */
export function overlayTopic(_base: string): string {
  return PUBLIC_TOPIC || TOPIC
}

export function overlayLookupService(_base: string): string {
  return PUBLIC_LOOKUP || LOOKUP_SERVICE
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

function parseScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): TraceReceipt | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseTraceFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function receiptOutputIndexes(tx: Transaction): number[] {
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
    admitted: receiptOutputIndexes(tx),
    raw,
    host,
    topic
  }
}

export async function submitReceiptTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = txFromWalletBeef(beef)
  try {
    const overlay = createBroadcaster(host, topic)
    const result = await tx.broadcast(overlay)
    if (result.status === 'success') {
      return {
        admitted: receiptOutputIndexes(tx),
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

async function postLookup(
  host: string,
  service: string,
  query: object
): Promise<LookupAnswer> {
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

/** Public overlay: raw POST so lookup never waits on a wallet / SLAP resolver. */
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

export function clientFilterIgnoresForeignMagic(items: OverlayItem[]): OverlayItem[] {
  return items.filter((item) => item.payload.magic === MAGIC)
}

function matchesQuery(item: OverlayItem, query: TraceQuery): boolean {
  if (item.payload.magic !== MAGIC) return false
  if (query.txid && item.txid !== query.txid) return false
  if (query.t) {
    return matchReceipts([item.payload], query.t).length > 0
  }
  return true
}

export async function lookupReceiptItems(base: string, query: TraceQuery = {}): Promise<OverlayItem[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const answers = await queryAnytx(host, service, query)
  const items = answers.flatMap(itemsFromAnswer)
  return clientFilterIgnoresForeignMagic(items).filter((item) => matchesQuery(item, query))
}

export async function lookupTrace(base: string, query: string): Promise<TraceView> {
  const cached = readCachedReceipts()
  try {
    const items = await lookupReceiptItems(base, { t: query })
    const rows = items.map((item) => ({
      ...item.payload,
      txid: item.txid,
      outputIndex: item.outputIndex
    }))
    const current = selectReceipt(rows, query)
    if (current) {
      const overlay = rows.find((row) => row.token === current.token) ?? {
        ...current,
        txid: '',
        outputIndex: 0
      }
      cacheReceipt(overlay)
      return {
        query,
        receipt: overlay,
        matches: matchReceipts(rows, query).map((row) => (
          rows.find((item) => item.token === row.token) ?? { ...row, txid: '', outputIndex: 0 }
        )),
        fromCache: false
      }
    }
    const kept = keepLastGoodReceipts(cached, [], items.length === 0)
    const fallback = selectReceipt(kept, query)
    if (fallback) {
      const overlay = kept.find((row) => row.token === fallback.token) ?? {
        ...fallback,
        txid: '',
        outputIndex: 0
      }
      return { query, receipt: overlay, matches: [overlay], fromCache: true }
    }
    return { query, receipt: null, matches: [], fromCache: false }
  } catch {
    const kept = keepLastGoodReceipts(cached, [], true)
    const cachedHit = query ? readCachedReceipt(query) : null
    const fallback = cachedHit ?? selectReceipt(kept, query)
    if (fallback) {
      const overlay = kept.find((row) => row.token === fallback.token) ?? cachedHit ?? {
        ...fallback,
        txid: '',
        outputIndex: 0
      }
      return { query, receipt: overlay, matches: [overlay], fromCache: true }
    }
    throw new Error('Couldn’t look up that receipt.')
  }
}

async function queryAnytx(
  host: string,
  service: string,
  query: TraceQuery
): Promise<LookupAnswer[]> {
  if (query.txid) {
    return [await queryLookup(host, service, { txid: query.txid }, 20000)]
  }

  const answers: LookupAnswer[] = []
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

function itemsFromAnswer(answer: LookupAnswer): OverlayItem[] {
  if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) return []
  return answer.outputs.flatMap((output) => {
    const fromScript = itemFromBeef(output.beef, output.outputIndex)
    return fromScript ? [fromScript] : []
  })
}

function itemFromBeef(beef: number[] | undefined, outputIndex: number): OverlayItem | null {
  if (!beef || beef.length === 0) return null
  try {
    const tx = txFromWalletBeef(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    const payload = parseScript(output.lockingScript)
    if (!payload) return null
    return {
      payload,
      txid: tx.id('hex'),
      outputIndex
    }
  } catch {
    return null
  }
}

export interface OverlayPing {
  ok: boolean
  error?: string
}

function fetchFailure(path: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  if (!message.trim() || /failed to fetch/i.test(message)) {
    return `Failed to fetch ${path}`
  }
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

/**
 * Pages: /version has no CORS and throws "Failed to fetch". Probe /health/live
 * first so that throw is not treated as overlay-offline.
 */
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
