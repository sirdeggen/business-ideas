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
  parseRaffleFields,
  type RaffleDraw,
  type RaffleHeader,
  type RafflePayload,
  type RaffleTicket
} from '../../../protocol/raffle'
import {
  PUBLIC_LOOKUP,
  PUBLIC_TOPIC,
  isLocalhostUrl
} from './config'

export interface OverlayItem {
  payload: RafflePayload
  txid: string
  outputIndex: number
  beef?: number[]
}

export interface OverlayHeader extends RaffleHeader {
  txid: string
  outputIndex: number
}

export interface OverlayTicket extends RaffleTicket {
  txid: string
  outputIndex: number
  beef?: number[]
}

export interface OverlayDraw extends RaffleDraw {
  txid: string
  outputIndex: number
}

export interface RaffleView {
  header: OverlayHeader | null
  tickets: OverlayTicket[]
  draws: OverlayDraw[]
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface RaffleQuery {
  outpoint?: string
  raffleId?: string
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
    // Ignore SHIP-discovered URLs (often localhost). Always POST to the pinned host.
    return new HTTPSOverlayBroadcastFacilitator(undefined, this.allowHTTP).send(this.host, taggedBEEF)
  }
}

function createBroadcaster(host: string, topic: string): TopicBroadcaster {
  const allowHTTP = host.startsWith('http://')
  return new TopicBroadcaster([topic], {
    // Skip SHIP discovery; the facilitator always posts to `host`.
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

function parseScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): RafflePayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseRaffleFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function raffleOutputIndexes(tx: Transaction): number[] {
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
    admitted: raffleOutputIndexes(tx),
    raw,
    host,
    topic
  }
}

export async function submitRaffleTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = txFromWalletBeef(beef)
  try {
    const overlay = createBroadcaster(host, topic)
    const result = await tx.broadcast(overlay)
    if (result.status === 'success') {
      return {
        admitted: raffleOutputIndexes(tx),
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

export async function lookupRaffleItems(base: string, query: RaffleQuery = {}): Promise<OverlayItem[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const resolver = createResolver(host, service)
  const answers = usesPublicAnytx(host)
    ? await queryAnytx(resolver, service, query)
    : [await resolver.query(localLookupQuestion(service, query), 15000)]

  const items = answers.flatMap(itemsFromAnswer)
  return items.filter((item) => matchesQuery(item, query))
}

export async function lookupRaffle(base: string, raffleId: string): Promise<RaffleView> {
  const items = await lookupRaffleItems(base, { raffleId })
  return viewFromItems(items, raffleId)
}

export function viewFromItems(items: OverlayItem[], raffleId?: string): RaffleView {
  const scoped = raffleId
    ? items.filter((item) => item.payload.raffleId === raffleId)
    : items
  const headers = scoped.filter((item) => item.payload.kind === 'header') as Array<OverlayItem & { payload: RaffleHeader }>
  const tickets = scoped.filter((item) => item.payload.kind === 'ticket') as Array<OverlayItem & { payload: RaffleTicket }>
  const draws = scoped.filter((item) => item.payload.kind === 'draw') as Array<OverlayItem & { payload: RaffleDraw }>
  return {
    header: headers[0]
      ? { ...headers[0].payload, txid: headers[0].txid, outputIndex: headers[0].outputIndex }
      : null,
    tickets: tickets.map((item) => ({
      ...item.payload,
      txid: item.txid,
      outputIndex: item.outputIndex,
      beef: item.beef
    })),
    draws: draws.map((item) => ({ ...item.payload, txid: item.txid, outputIndex: item.outputIndex }))
  }
}

function localLookupQuestion(service: string, query: RaffleQuery): { service: string, query: RaffleQuery } {
  return { service, query }
}

async function queryAnytx(
  resolver: LookupResolver,
  service: string,
  query: RaffleQuery
): Promise<LookupAnswer[]> {
  if (query.outpoint) {
    const [txid] = query.outpoint.split('.')
    return [await resolver.query({ service, query: { txid } }, 20000)]
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
      outputIndex,
      beef
    }
  } catch {
    return null
  }
}

function matchesQuery(item: OverlayItem, query: RaffleQuery): boolean {
  if (item.payload.magic !== MAGIC) return false
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (item.txid !== txid || item.outputIndex !== Number(vout)) return false
  }
  if (query.raffleId && item.payload.raffleId !== query.raffleId) return false
  return true
}

function fromContext(context: number[] | undefined, outputIndex: number): OverlayItem | null {
  if (!context || context.length === 0) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(context))) as RafflePayload & {
      txid?: string
      outputIndex?: number
    }
    const payload = parseRaffleFields(encodeContextFields(parsed))
    if (!payload) return hydrateContext(parsed, outputIndex)
    return {
      payload,
      txid: typeof parsed.txid === 'string' ? parsed.txid : '',
      outputIndex: parsed.outputIndex ?? outputIndex
    }
  } catch {
    return null
  }
}

function encodeContextFields(parsed: RafflePayload): number[][] {
  const enc = new TextEncoder()
  const utf8 = (value: string): number[] => Array.from(enc.encode(value))
  if (parsed.kind === 'header') {
    return [
      utf8(MAGIC), utf8(parsed.version), utf8('header'), utf8(parsed.raffleId), utf8(parsed.host),
      utf8(parsed.title), utf8(parsed.prize), utf8(parsed.whoCanEnter), utf8(String(parsed.ticketCount)),
      utf8(parsed.onePerPerson ? 'yes' : 'no'), utf8(parsed.drawNote),
      utf8(parsed.mustBePresent ? 'yes' : 'no'), utf8(parsed.hostName), utf8(parsed.timestamp),
      utf8(parsed.prizeValue ?? '')
    ]
  }
  if (parsed.kind === 'ticket') {
    return [
      utf8(MAGIC), utf8(parsed.version), utf8('ticket'), utf8(parsed.raffleId),
      utf8(String(parsed.ticketIndex)), utf8(parsed.holder), utf8(parsed.holderName ?? ''),
      utf8(parsed.timestamp)
    ]
  }
  return [
    utf8(MAGIC), utf8(parsed.version), utf8('draw'), utf8(parsed.raffleId),
    utf8(parsed.winningOutpoint), utf8(String(parsed.winningIndex)), utf8(parsed.timestamp),
    utf8(parsed.winnerName ?? '')
  ]
}

function hydrateContext(
  parsed: Partial<RafflePayload> & { txid?: string, outputIndex?: number, kind?: string },
  outputIndex: number
): OverlayItem | null {
  if (parsed.magic !== MAGIC || !parsed.kind || !parsed.raffleId) return null
  return {
    payload: parsed as RafflePayload,
    txid: parsed.txid ?? '',
    outputIndex: parsed.outputIndex ?? outputIndex
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
 * first so that throw is not treated as overlay-offline. /version stays a
 * last-resort fallback for local Docker, isolated so a CORS failure continues.
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
