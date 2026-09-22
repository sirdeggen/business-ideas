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
  artifactKindFromTexts,
  availableSats,
  collateralRefs,
  collateralTxid,
  facilityStatus,
  outstandingSats,
  parseCreditFields,
  utf8BytesToString,
  type CollateralRef,
  type CreditDefault,
  type CreditDraw,
  type CreditPayload,
  type CreditRepay,
  type CreditStatus,
  type CreditTerm
} from '../../../protocol/credit'
import { PUBLIC_LOOKUP, PUBLIC_TOPIC } from './config'

export interface OverlayItem {
  payload: CreditPayload
  txid: string
  outputIndex: number
}

export interface OverlayTerm extends CreditTerm {
  txid: string
  outputIndex: number
}

export interface OverlayDraw extends CreditDraw {
  txid: string
  outputIndex: number
}

export interface OverlayRepay extends CreditRepay {
  txid: string
  outputIndex: number
}

export interface OverlayDefault extends CreditDefault {
  txid: string
  outputIndex: number
}

export interface FacilityView {
  facilityId: string
  term: OverlayTerm | null
  draws: OverlayDraw[]
  repays: OverlayRepay[]
  flag: OverlayDefault | null
  status: CreditStatus | null
  outstanding: number
  available: number
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface FacilityQuery {
  outpoint?: string
  facilityId?: string
  txid?: string
}

export interface CollateralLookup {
  ref: CollateralRef
  found: 'invoice' | 'receipt' | 'receivable' | 'unseen' | 'reference'
  txid?: string
  outputIndex?: number
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

function parseScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): CreditPayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseCreditFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

function creditOutputIndexes(tx: Transaction): number[] {
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
  return { admitted: creditOutputIndexes(tx), raw, host, topic }
}

export async function submitCreditTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = txFromWalletBeef(beef)
  try {
    const overlay = createBroadcaster(host, topic)
    const result = await tx.broadcast(overlay)
    if (result.status === 'success') {
      return { admitted: creditOutputIndexes(tx), raw: result, host, topic }
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

async function queryLookup(host: string, service: string, query: object, timeoutMs: number): Promise<LookupAnswer> {
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

export async function lookupCreditItems(base: string, query: FacilityQuery = {}): Promise<OverlayItem[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const answers = await queryAnytx(host, service, query)
  const items = answers.flatMap(itemsFromAnswer)
  return items.filter((item) => matchesQuery(item, query))
}

export async function lookupFacility(base: string, facilityId: string, txid?: string): Promise<FacilityView> {
  const items = await lookupCreditItems(base, { facilityId, txid })
  return viewFromItems(items, facilityId)
}

export async function lookupFacilities(base: string): Promise<FacilityView[]> {
  const items = await lookupCreditItems(base)
  const ids = [...new Set(
    items
      .filter((item) => item.payload.kind === 'term')
      .map((item) => item.payload.facilityId)
  )]
  return ids
    .map((id) => viewFromItems(items, id))
    .filter((view) => view.term)
    .sort((a, b) => (b.term?.openedAt ?? '').localeCompare(a.term?.openedAt ?? ''))
}

export function viewFromItems(items: OverlayItem[], facilityId?: string): FacilityView {
  const scoped = facilityId
    ? items.filter((item) => item.payload.facilityId === facilityId)
    : items
  const terms = scoped.filter((item) => item.payload.kind === 'term') as Array<OverlayItem & { payload: CreditTerm }>
  const draws = scoped
    .filter((item) => item.payload.kind === 'draw')
    .map((item) => ({ ...(item.payload as CreditDraw), txid: item.txid, outputIndex: item.outputIndex }))
    .sort((a, b) => a.drawnAt.localeCompare(b.drawnAt))
  const repays = scoped
    .filter((item) => item.payload.kind === 'repay')
    .map((item) => ({ ...(item.payload as CreditRepay), txid: item.txid, outputIndex: item.outputIndex }))
    .sort((a, b) => a.repaidAt.localeCompare(b.repaidAt))
  const flags = scoped.filter((item) => item.payload.kind === 'default') as Array<OverlayItem & { payload: CreditDefault }>
  const term = terms[0]
    ? { ...terms[0].payload, txid: terms[0].txid, outputIndex: terms[0].outputIndex }
    : null
  const flag = flags[0]
    ? { ...flags[0].payload, txid: flags[0].txid, outputIndex: flags[0].outputIndex }
    : null
  const outstanding = outstandingSats(draws, repays)
  return {
    facilityId: facilityId || term?.facilityId || '',
    term,
    draws,
    repays,
    flag,
    status: facilityStatus({
      term: Boolean(term),
      outstanding,
      drawCount: draws.length,
      repayCount: repays.length,
      flagged: Boolean(flag)
    }),
    outstanding,
    available: term ? availableSats(term.limitSats, outstanding) : 0
  }
}

async function queryAnytx(host: string, service: string, query: FacilityQuery): Promise<LookupAnswer[]> {
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

function matchesQuery(item: OverlayItem, query: FacilityQuery): boolean {
  if (item.payload.magic !== MAGIC) return false
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (item.txid !== txid || item.outputIndex !== Number(vout)) return false
  }
  if (query.facilityId && item.payload.facilityId !== query.facilityId) return false
  return true
}

function textsFromScript(lockingScript: Parameters<typeof PushDrop.decode>[0]): string[] {
  for (const position of ['before', 'after'] as const) {
    try {
      return PushDrop.decode(lockingScript, position).fields.map((field) => {
        try {
          return utf8BytesToString(Array.from(field))
        } catch {
          return ''
        }
      })
    } catch {
      // Try the other lock() position.
    }
  }
  return []
}

function artifactFromBeef(beef: number[] | undefined): { kind: 'invoice' | 'receipt' | 'receivable', outputIndex: number } | null {
  if (!beef || beef.length === 0) return null
  try {
    const tx = txFromWalletBeef(beef)
    for (const [outputIndex, output] of tx.outputs.entries()) {
      const kind = artifactKindFromTexts(textsFromScript(output.lockingScript))
      if (kind) return { kind, outputIndex }
    }
    return null
  } catch {
    return null
  }
}

/** Look up an invoice, receipt, or receivable by overlay id or receipt. Does not create one. */
export async function lookupCollateral(base: string, ref: CollateralRef): Promise<CollateralLookup> {
  const txid = collateralTxid(ref)
  if (!txid) return { ref, found: 'reference' }
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const answer = await queryLookup(host, service, { txid }, 20000)
  if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) {
    return { ref, found: 'unseen', txid }
  }
  for (const output of answer.outputs) {
    const hit = artifactFromBeef(output.beef)
    if (!hit) continue
    if (ref.kind === 'receipt') {
      const vout = Number(ref.id.split('.')[1])
      if (hit.outputIndex !== vout && output.outputIndex !== vout) continue
    }
    return { ref, found: hit.kind, txid, outputIndex: hit.outputIndex }
  }
  return { ref, found: 'unseen', txid }
}

export function termCollateral(term: CreditTerm | null): CollateralRef[] {
  if (!term) return []
  return collateralRefs(term.collateral)
}

export interface OverlayPing {
  ok: boolean
  error?: string
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
