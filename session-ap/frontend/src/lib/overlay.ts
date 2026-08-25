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
import { PUBLIC_LOOKUP, PUBLIC_TOPIC, isLocalhostUrl } from './config'
import {
  LOOKUP_SERVICE,
  MAGIC,
  TOPIC,
  filterSessionPayloads,
  joinSessionRecords,
  parseSessionFields,
  type IndexedAnnouncement,
  type IndexedSession,
  type JoinedSession,
  type SessionPayload
} from './protocol'

export interface OverlayItem {
  payload: SessionPayload
  txid: string
  outputIndex: number
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface SessionQuery {
  sessionId?: string
  txid?: string
}

function overlayUrl(base: string): string {
  return base.replace(/\/$/, '')
}

export function usesPublicAnytx(base: string): boolean {
  return !isLocalhostUrl(base)
}

export function overlayTopic(base: string): string {
  return usesPublicAnytx(base) ? PUBLIC_TOPIC : TOPIC
}

export function overlayLookupService(base: string): string {
  return usesPublicAnytx(base) ? PUBLIC_LOOKUP : LOOKUP_SERVICE
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

function parseScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): SessionPayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseSessionFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function sessionOutputIndexes(tx: Transaction): number[] {
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
    admitted: sessionOutputIndexes(tx),
    raw,
    host,
    topic
  }
}

export async function submitSessionTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = txFromWalletBeef(beef)
  try {
    const overlay = createBroadcaster(host, topic)
    const result = await tx.broadcast(overlay)
    if (result.status === 'success') {
      return {
        admitted: sessionOutputIndexes(tx),
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

export async function lookupSessionItems(base: string, query: SessionQuery = {}): Promise<OverlayItem[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const resolver = createResolver(host, service)
  const answers = await queryAnytx(resolver, service, query)
  const items = answers.flatMap(itemsFromAnswer)
  return items.filter((item) => matchesQuery(item, query))
}

export async function lookupSession(base: string, sessionId: string, hintTxids: string[] = []): Promise<JoinedSession | null> {
  const items = await lookupSessionItems(base, { sessionId })
  const extra: OverlayItem[] = []
  for (const txid of hintTxids) {
    if (!txid || items.some((item) => item.txid === txid)) continue
    try {
      extra.push(...await lookupSessionItems(base, { txid, sessionId }))
    } catch {
      // Hint miss is fine; paging may still have it.
    }
  }
  return viewFromItems([...items, ...extra], sessionId)
}

export function viewFromItems(items: OverlayItem[], sessionId?: string): JoinedSession | null {
  const scoped = sessionId
    ? items.filter((item) => item.payload.sessionId === sessionId)
    : items
  const sessions: IndexedSession[] = []
  const announcements: IndexedAnnouncement[] = []
  for (const item of scoped) {
    if (item.payload.kind === 'session') {
      sessions.push({ invoice: item.payload, txid: item.txid, outputIndex: item.outputIndex })
    } else {
      announcements.push({
        announcement: item.payload,
        txid: item.txid,
        outputIndex: item.outputIndex
      })
    }
  }
  return joinSessionRecords(sessions, announcements)[0] ?? null
}

async function queryAnytx(
  resolver: LookupResolver,
  service: string,
  query: SessionQuery
): Promise<LookupAnswer[]> {
  if (query.txid) {
    return [await resolver.query({ service, query: { txid: query.txid } }, 20000)]
  }

  const answers: LookupAnswer[] = []
  const pageSize = 100
  for (let page = 0; page < 5; page++) {
    const answer = await resolver.query({
      service,
      query: { limit: pageSize, skip: page * pageSize, sortOrder: 'desc' }
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
    if (fromScript) return [fromScript]
    const fromCtx = fromContext(output.context, output.outputIndex)
    return fromCtx ? [fromCtx] : []
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

function matchesQuery(item: OverlayItem, query: SessionQuery): boolean {
  if (item.payload.magic !== MAGIC) return false
  if (query.sessionId && item.payload.sessionId !== query.sessionId) return false
  if (query.txid && item.txid !== query.txid) return false
  return true
}

function fromContext(context: number[] | undefined, outputIndex: number): OverlayItem | null {
  if (!context || context.length === 0) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(context))) as SessionPayload & {
      txid?: string
      outputIndex?: number
    }
    const payload = parseSessionFields(encodeContextFields(parsed))
    if (!payload || payload.magic !== MAGIC) return null
    return {
      payload,
      txid: typeof parsed.txid === 'string' ? parsed.txid : '',
      outputIndex: parsed.outputIndex ?? outputIndex
    }
  } catch {
    return null
  }
}

function encodeContextFields(parsed: SessionPayload): number[][] {
  const enc = new TextEncoder()
  const utf8 = (value: string): number[] => Array.from(enc.encode(value))
  if (parsed.kind === 'session') {
    return [
      utf8(MAGIC), utf8(parsed.version), utf8('session'), utf8(parsed.sessionId),
      utf8(parsed.payerIdentity), utf8(parsed.payeeIdentity), utf8(parsed.label),
      utf8(parsed.dueDate), utf8(parsed.createdAt), utf8(JSON.stringify(parsed.lineItems)),
      utf8(String(parsed.totalSats)), utf8(parsed.status)
    ]
  }
  if (parsed.kind === 'approval') {
    return [
      utf8(MAGIC), utf8(parsed.version), utf8('approval'), utf8(parsed.sessionId),
      utf8(parsed.approverIdentity), utf8(parsed.timestamp)
    ]
  }
  return [
    utf8(MAGIC), utf8(parsed.version), utf8('payment'), utf8(parsed.sessionId),
    utf8(parsed.payerIdentity), utf8(String(parsed.amountSats)), utf8(parsed.timestamp),
    utf8(JSON.stringify(parsed.remittance))
  ]
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

  return { ok: false, error: errors[0] ?? 'Overlay check failed' }
}

export function clientFilterIgnoresForeignMagic(items: OverlayItem[]): OverlayItem[] {
  return items.filter((item) => filterSessionPayloads([item.payload]).length > 0)
}
