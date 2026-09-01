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
  parseMembershipFields,
  selectShowKey,
  type MembershipDef,
  type MembershipKey,
  type MembershipPayload
} from '../../../protocol/membership'
import { PUBLIC_LOOKUP, PUBLIC_TOPIC } from './config'

export interface OverlayItem {
  payload: MembershipPayload
  txid: string
  outputIndex: number
}

export interface OverlayDef extends MembershipDef {
  txid: string
  outputIndex: number
}

export interface OverlayKey extends MembershipKey {
  txid: string
  outputIndex: number
}

export interface MembershipView {
  membership: OverlayDef | null
  key: OverlayKey | null
  keys: OverlayKey[]
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface MembershipQuery {
  outpoint?: string
  membershipId?: string
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

function parseScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): MembershipPayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseMembershipFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function membershipOutputIndexes(tx: Transaction): number[] {
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
    admitted: membershipOutputIndexes(tx),
    raw,
    host,
    topic
  }
}

export async function submitMembershipTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = txFromWalletBeef(beef)
  try {
    const overlay = createBroadcaster(host, topic)
    const result = await tx.broadcast(overlay)
    if (result.status === 'success') {
      return {
        admitted: membershipOutputIndexes(tx),
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

export async function lookupMembershipItems(base: string, query: MembershipQuery = {}): Promise<OverlayItem[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const resolver = createResolver(host, service)
  const answers = await queryAnytx(resolver, service, query)
  const items = answers.flatMap(itemsFromAnswer)
  return items.filter((item) => matchesQuery(item, query))
}

export async function lookupMembership(
  base: string,
  membershipId: string,
  txid?: string
): Promise<MembershipView> {
  const items = await lookupMembershipItems(base, { membershipId, txid })
  return viewFromItems(items, membershipId, txid)
}

export function viewFromItems(
  items: OverlayItem[],
  membershipId?: string,
  hintTxid?: string
): MembershipView {
  const scoped = membershipId
    ? items.filter((item) => item.payload.membershipId === membershipId)
    : items
  const defs = scoped.filter((item) => item.payload.kind === 'def') as Array<OverlayItem & { payload: MembershipDef }>
  const keys = scoped.filter((item) => item.payload.kind === 'key') as Array<OverlayItem & { payload: MembershipKey }>
  const overlayKeys: OverlayKey[] = keys.map((item) => ({
    ...item.payload,
    txid: item.txid,
    outputIndex: item.outputIndex
  }))
  const chosen = selectShowKey(overlayKeys, hintTxid)
  return {
    membership: defs[0]
      ? { ...defs[0].payload, txid: defs[0].txid, outputIndex: defs[0].outputIndex }
      : null,
    key: chosen,
    keys: overlayKeys
  }
}

async function queryAnytx(
  resolver: LookupResolver,
  service: string,
  query: MembershipQuery
): Promise<LookupAnswer[]> {
  const answers: LookupAnswer[] = []
  const txid = query.txid || (query.outpoint ? query.outpoint.split('.')[0] : undefined)
  if (txid) {
    answers.push(await resolver.query({ service, query: { txid } }, 20000))
  }

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

/**
 * ls_anytx findByTxid often returns one arbitrary vout (change). Scan every
 * BEEF output and keep MAGIC membership fields only.
 */
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

function matchesQuery(item: OverlayItem, query: MembershipQuery): boolean {
  if (item.payload.magic !== MAGIC) return false
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (item.txid !== txid || item.outputIndex !== Number(vout)) return false
  }
  if (query.membershipId && item.payload.membershipId !== query.membershipId) return false
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
