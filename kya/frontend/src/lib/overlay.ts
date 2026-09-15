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
  kyaStatus,
  latestBind,
  latestCredential,
  parseKyaFields,
  type KyaBind,
  type KyaCredential,
  type KyaPayload,
  type KyaReceipt,
  type KyaStatus
} from '../../../protocol/kya'
import { PUBLIC_LOOKUP, PUBLIC_TOPIC } from './config'

export interface OverlayItem {
  payload: KyaPayload
  txid: string
  outputIndex: number
}

export interface OverlayBind extends KyaBind {
  txid: string
  outputIndex: number
}

export interface OverlayCredential extends KyaCredential {
  txid: string
  outputIndex: number
}

export interface OverlayReceipt extends KyaReceipt {
  txid: string
  outputIndex: number
}

export interface AgentView {
  agentId: string
  bind: OverlayBind | null
  credential: OverlayCredential | null
  receipts: OverlayReceipt[]
  status: KyaStatus | null
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface AgentQuery {
  outpoint?: string
  agentId?: string
  txid?: string
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

function parseScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): KyaPayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseKyaFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function kyaOutputIndexes(tx: Transaction): number[] {
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
    admitted: kyaOutputIndexes(tx),
    raw,
    host,
    topic
  }
}

export async function submitKyaTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = txFromWalletBeef(beef)
  try {
    const overlay = createBroadcaster(host, topic)
    const result = await tx.broadcast(overlay)
    if (result.status === 'success') {
      return {
        admitted: kyaOutputIndexes(tx),
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

export async function lookupAgentItems(base: string, query: AgentQuery = {}): Promise<OverlayItem[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const answers = await queryAnytx(host, service, query)
  const items = answers.flatMap(itemsFromAnswer)
  return items.filter((item) => matchesQuery(item, query))
}

export async function lookupAgent(
  base: string,
  agentId: string,
  txid?: string
): Promise<AgentView> {
  const items = await lookupAgentItems(base, { agentId, txid })
  return viewFromItems(items, agentId)
}

export function viewFromItems(items: OverlayItem[], agentId?: string): AgentView {
  const scoped = agentId
    ? items.filter((item) => item.payload.agentId === agentId)
    : items
  const binds = scoped
    .filter((item): item is OverlayItem & { payload: KyaBind } => item.payload.kind === 'bind')
    .map((item) => ({ ...item.payload, txid: item.txid, outputIndex: item.outputIndex }))
  const credentials = scoped
    .filter((item): item is OverlayItem & { payload: KyaCredential } => item.payload.kind === 'credential')
    .map((item) => ({ ...item.payload, txid: item.txid, outputIndex: item.outputIndex }))
  const receipts = scoped
    .filter((item): item is OverlayItem & { payload: KyaReceipt } => item.payload.kind === 'receipt')
    .map((item) => ({ ...item.payload, txid: item.txid, outputIndex: item.outputIndex }))
    .sort((a, b) => b.verifiedAt.localeCompare(a.verifiedAt))
  const bind = latestBind(binds) as OverlayBind | null
  const credential = latestCredential(credentials) as OverlayCredential | null

  return {
    agentId: agentId || bind?.agentId || '',
    bind,
    credential,
    receipts,
    status: kyaStatus({ bind, credential, receipts })
  }
}

async function queryAnytx(
  host: string,
  service: string,
  query: AgentQuery
): Promise<LookupAnswer[]> {
  const answers: LookupAnswer[] = []
  const txid = query.txid || (query.outpoint ? query.outpoint.split('.')[0] : undefined)
  if (txid) {
    answers.push(await queryLookup(host, service, { txid }, 20000))
  }

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
  const seen = new Set<string>()
  const rows: OverlayItem[] = []
  for (const output of answer.outputs) {
    const decoded = itemsFromBeef(output.beef, output.txid)
    for (const item of decoded) {
      const key = `${item.txid}.${item.outputIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(item)
    }
  }
  return rows
}

function itemsFromBeef(beef: number[] | undefined, txidHint?: string): OverlayItem[] {
  if (!beef || beef.length === 0) return []
  try {
    const tx = txFromWalletBeef(beef)
    const txid = txidHint || tx.id('hex')
    const rows: OverlayItem[] = []
    for (const [outputIndex, output] of tx.outputs.entries()) {
      const payload = parseScript(output.lockingScript)
      if (!payload) continue
      rows.push({ payload, txid, outputIndex })
    }
    return rows
  } catch {
    return []
  }
}

function matchesQuery(item: OverlayItem, query: AgentQuery): boolean {
  if (item.payload.magic !== MAGIC) return false
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (item.txid !== txid || item.outputIndex !== Number(vout)) return false
  }
  if (query.agentId && item.payload.agentId !== query.agentId) return false
  return true
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
