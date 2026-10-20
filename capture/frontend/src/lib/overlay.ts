import {
  HTTPSOverlayBroadcastFacilitator,
  LookupResolver,
  PushDrop,
  TopicBroadcaster,
  Transaction,
  WhatsOnChain,
  type ChainTracker,
  type LookupAnswer,
  type OverlayBroadcastFacilitator,
  type STEAK,
  type TaggedBEEF
} from '@bsv/sdk'
import {
  MAGIC,
  bookFromChain,
  contributorSigningKey,
  deskFromChain,
  parseCaptureFields,
  proofInclusion,
  requestLockedToRequester,
  sameKey,
  type BlockHeaderTime,
  type CapturePayload,
  type ChainOutput,
  type ChainRecord,
  type DeskState,
  type ListedRequest,
  type ReadOptions
} from '../../../protocol/capture'
import { PUBLIC_LOOKUP, PUBLIC_TOPIC } from './config'

export interface OverlayItem {
  payload: CapturePayload
  txid: string
  outputIndex: number
  inputs?: string[]
  lockingPublicKey?: string
  outputs?: ChainOutput[]
  blockHeight?: number
  merkleRoot?: string
  blockIndex?: number
  hostAssertedAt?: string
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface CaptureQuery {
  outpoint?: string
  requestId?: string
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

function parseScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): { payload: CapturePayload, lockingPublicKey: string } | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const decoded = PushDrop.decode(lockingScript, position)
      const item = parseCaptureFields(decoded.fields)
      if (!item) continue
      const lockingPublicKey = decoded.lockingPublicKey.toString()
      if (item.kind === 'request' && !requestLockedToRequester(lockingPublicKey, item)) return null
      if (item.kind === 'submit' && !sameKey(lockingPublicKey, contributorSigningKey(item.contributorIdentity))) return null
      return { payload: item, lockingPublicKey }
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function captureOutputIndexes(tx: Transaction): number[] {
  const indexes: number[] = []
  for (const [index, output] of tx.outputs.entries()) {
    if (parseScript(output.lockingScript)) indexes.push(index)
  }
  return indexes
}

function inputOutpoints(tx: Transaction): string[] {
  const points: string[] = []
  for (const input of tx.inputs) {
    const source = input.sourceTXID || input.sourceTransaction?.id('hex')
    if (!source || input.sourceOutputIndex == null) continue
    points.push(`${source}.${input.sourceOutputIndex}`.toLowerCase())
  }
  return points
}

function toChain(item: OverlayItem): ChainRecord {
  return {
    txid: item.txid.trim().toLowerCase(),
    vout: item.outputIndex,
    inputs: (item.inputs ?? []).map((input) => input.trim().toLowerCase()),
    lockingPublicKey: item.lockingPublicKey ?? '',
    payload: item.payload,
    outputs: item.outputs,
    blockHeight: item.blockHeight,
    merkleRoot: item.merkleRoot,
    blockIndex: item.blockIndex,
    hostAssertedAt: item.hostAssertedAt
  }
}

/** Overlay context times are host-asserted. They are not the deadline clock. */
export function hostAssertedAt(context?: number[]): string | undefined {
  if (!context || context.length === 0) return undefined
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(context))) as { blockTime?: unknown, admittedAt?: unknown }
    const raw = parsed.blockTime ?? parsed.admittedAt
    if (typeof raw === 'number' && Number.isFinite(raw)) {
      const ms = raw > 1e12 ? raw : raw * 1000
      const when = new Date(ms)
      if (Number.isNaN(when.getTime())) return undefined
      return when.toISOString()
    }
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  } catch {
    // Context that is not JSON has no host-asserted time.
  }
  return undefined
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
    admitted: captureOutputIndexes(tx),
    raw,
    host,
    topic
  }
}

export async function submitCaptureTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = txFromWalletBeef(beef)
  try {
    const overlay = createBroadcaster(host, topic)
    const result = await tx.broadcast(overlay)
    if (result.status === 'success') {
      return {
        admitted: captureOutputIndexes(tx),
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

export function keepCapture(items: OverlayItem[]): OverlayItem[] {
  return items.filter((item) => item.payload.magic === MAGIC)
}

function matchesQuery(item: OverlayItem, query: CaptureQuery): boolean {
  if (item.payload.magic !== MAGIC) return false
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (item.txid !== txid || item.outputIndex !== Number(vout)) return false
  }
  if (query.requestId && item.payload.requestId !== query.requestId) return false
  return true
}

export async function boardFromItems(
  items: OverlayItem[],
  pinIdentity?: string | null,
  spentOutpoints: string[] = [],
  client?: HeaderClient
): Promise<ListedRequest[]> {
  const records = keepCapture(items).map(toChain)
  const headers = proofsNeedHeaders(records)
    ? await verifiedHeaders(records, client ?? mainnetHeaderClient())
    : []
  return bookFromChain(records, pinIdentity, headers, spentOutpoints)
}

export async function viewFromItems(
  items: OverlayItem[],
  requestId?: string,
  options: ReadOptions = {},
  client?: HeaderClient
): Promise<DeskState | null> {
  const scoped = keepCapture(items).filter((item) => !requestId || item.payload.requestId === requestId)
  const records = scoped.map(toChain)
  const headers = proofsNeedHeaders(records)
    ? await verifiedHeaders(records, client ?? mainnetHeaderClient())
    : []
  return deskFromChain(records, { ...options, requestId, headers, spentOutpoints: options.spentOutpoints ?? [] })
}

async function queryAnytx(host: string, service: string, query: CaptureQuery): Promise<LookupAnswer[]> {
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

export interface OverlayRead {
  items: OverlayItem[]
  spentOutpoints: string[]
}

/** Mainnet block header. Time counts only after the merkle root matches the proof. */
export const MAINNET_HEADER_URL = 'https://api.whatsonchain.com/v1/bsv/main/block'

export type HeaderFetcher = (url: string) => Promise<Pick<Response, 'ok' | 'json'>>

export interface HeaderClient {
  loadHeader: (height: number) => Promise<BlockHeaderTime | null>
  tracker: Pick<ChainTracker, 'isValidRootForHeight'>
}

export async function fetchBlockHeader(height: number, fetcher: HeaderFetcher = fetch): Promise<BlockHeaderTime | null> {
  if (!Number.isInteger(height) || height < 0) return null
  const response = await fetcher(`${MAINNET_HEADER_URL}/${height}/header`)
  if (!response.ok) return null
  const body = await response.json() as { merkleroot?: unknown, time?: unknown }
  const merkleRoot = typeof body.merkleroot === 'string' ? body.merkleroot.trim().toLowerCase() : ''
  const time = typeof body.time === 'number' ? body.time : Number(body.time)
  if (!/^[0-9a-f]{64}$/.test(merkleRoot) || !Number.isFinite(time)) return null
  return { height, time, merkleRoot }
}

let sharedClient: HeaderClient | null = null

export function mainnetHeaderClient(): HeaderClient {
  if (!sharedClient) {
    sharedClient = {
      loadHeader: (height) => fetchBlockHeader(height),
      tracker: new WhatsOnChain('main')
    }
  }
  return sharedClient
}

/**
 * Headers whose merkle root matches the BEEF proof, and whose root the
 * chain tracker accepts at that height. A host-supplied time is not used.
 */
export async function verifiedHeaders(records: ChainRecord[], client: HeaderClient): Promise<BlockHeaderTime[]> {
  const wanted = new Map<string, { height: number, root: string }>()
  for (const record of records) {
    if (record.blockHeight == null || !record.merkleRoot) continue
    const root = record.merkleRoot.trim().toLowerCase()
    if (!root) continue
    wanted.set(`${record.blockHeight}:${root}`, { height: record.blockHeight, root })
  }
  const headers: BlockHeaderTime[] = []
  for (const { height, root } of wanted.values()) {
    try {
      const header = await client.loadHeader(height)
      if (!header || header.height !== height) continue
      if (header.merkleRoot.trim().toLowerCase() !== root) continue
      const valid = await client.tracker.isValidRootForHeight(root, height)
      if (!valid) continue
      headers.push({ height, time: header.time, merkleRoot: root })
    } catch {
      // One failed height leaves that proof pending. The rest of the board still loads.
    }
  }
  return headers
}

function proofsNeedHeaders(records: ChainRecord[]): boolean {
  return records.some((record) => record.blockHeight != null && Boolean(record.merkleRoot))
}

export function decodeOverlayBeef(beef: number[] | undefined, txidHint?: string, context?: number[]): OverlayRead {
  if (!beef || beef.length === 0) return { items: [], spentOutpoints: [] }
  try {
    const tx = txFromWalletBeef(beef)
    const txid = txidHint || tx.id('hex')
    const inputs = inputOutpoints(tx)
    const outputs: ChainOutput[] = tx.outputs.map((output) => ({
      satoshis: Number(output.satoshis ?? 0),
      lockingScript: output.lockingScript.toHex()
    }))
    const inclusion = tx.merklePath ? proofInclusion(txid, tx.merklePath) : null
    const hostAsserted = hostAssertedAt(context)
    const items: OverlayItem[] = []
    for (const [outputIndex, output] of tx.outputs.entries()) {
      const parsed = parseScript(output.lockingScript)
      if (!parsed) continue
      items.push({
        payload: parsed.payload,
        txid,
        outputIndex,
        inputs,
        lockingPublicKey: parsed.lockingPublicKey,
        outputs,
        blockHeight: inclusion?.blockHeight,
        merkleRoot: inclusion?.merkleRoot,
        blockIndex: inclusion?.blockIndex,
        hostAssertedAt: hostAsserted
      })
    }
    return { items, spentOutpoints: inputs }
  } catch {
    return { items: [], spentOutpoints: [] }
  }
}

function answerRows(answer: LookupAnswer): OverlayRead {
  if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) return { items: [], spentOutpoints: [] }
  const seen = new Set<string>()
  const items: OverlayItem[] = []
  const spent = new Set<string>()
  for (const output of answer.outputs) {
    const decoded = decodeOverlayBeef(output.beef, output.txid, output.context)
    for (const outpoint of decoded.spentOutpoints) spent.add(outpoint)
    for (const item of decoded.items) {
      const key = `${item.txid}.${item.outputIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }
  }
  return { items, spentOutpoints: [...spent] }
}

export async function readOverlay(base: string, query: CaptureQuery = {}): Promise<OverlayRead> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const answers = await queryAnytx(host, service, query)
  const seen = new Set<string>()
  const items: OverlayItem[] = []
  const spent = new Set<string>()
  for (const part of answers.map(answerRows)) {
    for (const outpoint of part.spentOutpoints) spent.add(outpoint)
    for (const item of part.items) {
      if (!matchesQuery(item, query)) continue
      const key = `${item.txid}.${item.outputIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      items.push(item)
    }
  }
  return { items, spentOutpoints: [...spent] }
}

export async function lookupCaptureItems(base: string, query: CaptureQuery = {}): Promise<OverlayItem[]> {
  return (await readOverlay(base, query)).items
}

export async function lookupCapture(
  base: string,
  requestId: string,
  txid?: string,
  pinIdentity?: string | null
): Promise<DeskState | null> {
  const read = await readOverlay(base, { requestId, txid })
  return viewFromItems(read.items, requestId, { hintTxid: txid, pinIdentity, spentOutpoints: read.spentOutpoints })
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
