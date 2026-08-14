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
  ADVANCE_BPS,
  LOOKUP_SERVICE,
  MAGIC,
  TOPIC,
  explainReceivableParse,
  parseReceivableFields,
  type ReceivablePayload
} from '../../../protocol/receivable'
import {
  PUBLIC_LOOKUP,
  PUBLIC_TOPIC,
  isLocalhostUrl
} from './config'

export interface OverlayReceivable extends ReceivablePayload {
  txid: string
  outputIndex: number
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
  host: string
  topic: string
}

export interface LookupInspection {
  rows: OverlayReceivable[]
  listed: number
  parsed: number
  unparsed: Array<{ reason: string }>
}

export interface ReceivableQuery {
  outpoint?: string
  invoiceId?: string
  creditor?: string
  debtor?: string
  status?: ReceivablePayload['status'] | 'unpaid'
  approvedUnpaid?: boolean
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

function parseScriptFields(lockingScript: Parameters<typeof PushDrop.decode>[0]): {
  item: ReturnType<typeof parseReceivableFields>
  why?: string
} {
  const errors: string[] = []
  for (const position of ['before', 'after'] as const) {
    try {
      const fields = PushDrop.decode(lockingScript, position).fields
      const item = parseReceivableFields(fields)
      if (item) return { item }
      errors.push(`${position}: ${explainReceivableParse(fields)}`)
    } catch (error) {
      errors.push(`${position}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  return { item: null, why: errors[0] }
}

function receivableOutputIndexes(tx: Transaction): number[] {
  const indexes: number[] = []
  for (const [index, output] of tx.outputs.entries()) {
    const decoded = parseScriptFields(output.lockingScript)
    if (decoded?.item) indexes.push(index)
  }
  return indexes
}

export async function submitReceivableTx(base: string, beef: number[]): Promise<SubmitResult> {
  const host = overlayUrl(base)
  const topic = overlayTopic(host)
  const tx = Transaction.fromBEEF(beef)
  const overlay = createBroadcaster(host, topic)
  const result = await tx.broadcast(overlay)
  if (result.status !== 'success') {
    const description = 'description' in result ? result.description : ''
    throw new Error(
      description
        ? `Overlay broadcast to ${topic} at ${host} failed: ${description}`
        : `Overlay broadcast to ${topic} at ${host} failed`
    )
  }
  return {
    admitted: receivableOutputIndexes(tx),
    raw: result,
    host,
    topic
  }
}

export async function inspectLookupReceivables(
  base: string,
  query: ReceivableQuery = {}
): Promise<LookupInspection> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const resolver = createResolver(host, service)
  const answers = usesPublicAnytx(host)
    ? await queryAnytx(resolver, service, query)
    : [await resolver.query({ service, query }, 15000)]

  const inspected = answers.flatMap(inspectAnswer)
  const rows = inspected
    .map((entry) => entry.row)
    .filter((row): row is OverlayReceivable => Boolean(row))
    .filter((row) => matchesReceivableQuery(row, query))
  return {
    rows,
    listed: inspected.length,
    parsed: inspected.filter((entry) => entry.row).length,
    unparsed: inspected.filter((entry) => !entry.row && entry.reason).map((entry) => ({ reason: entry.reason as string }))
  }
}

export async function lookupReceivables(
  base: string,
  query: ReceivableQuery = {}
): Promise<OverlayReceivable[]> {
  return (await inspectLookupReceivables(base, query)).rows
}

export function formatLookupDiagnostic(inspection: LookupInspection, publicAnytx = false): string {
  if (inspection.parsed > 0) return ''
  if (inspection.listed === 0) return ''
  // Public ls_anytx is a firehose — only report outputs that looked like invoices.
  if (publicAnytx && inspection.unparsed.length === 0) return ''
  const why = inspection.unparsed[0]?.reason
  return `listed ${inspection.listed}, none parsed as invoices` + (why ? ` (${why})` : '')
}

async function queryAnytx(
  resolver: LookupResolver,
  service: string,
  query: ReceivableQuery
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

function inspectAnswer(answer: LookupAnswer): Array<{ row: OverlayReceivable | null, reason?: string }> {
  if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) return []
  return answer.outputs.map((output) => {
    const fromScript = receivableFromBeef(output.beef, output.outputIndex)
    if (fromScript.row || fromScript.reason) return fromScript
    const fromCtx = fromContext(output.context, output.outputIndex)
    return fromCtx ? { row: fromCtx } : { row: null }
  })
}

function looksLikeReceivableAttempt(why?: string): boolean {
  if (!why) return false
  // MAGIC found but the rest failed — not every PushDrop on ls_anytx.
  return /fields after receivable|incomplete|invalid invoice|invalid creditor|invalid debtor|amount must|due date|status must/i.test(why)
}

function receivableFromBeef(
  beef: number[] | undefined,
  outputIndex: number
): { row: OverlayReceivable | null, reason?: string } {
  if (!beef || beef.length === 0) return { row: null }
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return { row: null }
    const decoded = parseScriptFields(output.lockingScript)
    if (!decoded.item) {
      return {
        row: null,
        reason: looksLikeReceivableAttempt(decoded.why) ? decoded.why : undefined
      }
    }
    return {
      row: {
        ...decoded.item,
        txid: tx.id('hex'),
        outputIndex
      }
    }
  } catch {
    return { row: null }
  }
}

function matchesReceivableQuery(row: OverlayReceivable, query: ReceivableQuery): boolean {
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (row.txid !== txid || row.outputIndex !== Number(vout)) return false
  }
  if (query.invoiceId && row.invoiceId !== query.invoiceId) return false
  if (query.creditor && row.creditor !== query.creditor) return false
  if (query.debtor && row.debtor !== query.debtor) return false
  if (query.approvedUnpaid && row.status !== 'approved') return false
  if (query.status === 'unpaid') {
    if (row.status === 'paid') return false
  } else if (query.status && row.status !== query.status) {
    return false
  }
  return true
}

export async function recordAdvanceIntent(
  base: string,
  invoiceId: string,
  advanceBps = ADVANCE_BPS
): Promise<{ invoiceId: string, advanceBps: number, stubAdvanceSats: number, notice: string }> {
  const response = await fetch(`${overlayUrl(base)}/intent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId, advanceBps })
  })
  const raw = await response.json().catch(() => ({})) as {
    error?: string
    invoiceId?: string
    advanceBps?: number
    stubAdvanceSats?: number
    notice?: string
  }
  if (!response.ok) {
    throw new Error(raw.error || `Overlay /intent failed (${response.status})`)
  }
  return {
    invoiceId: raw.invoiceId ?? invoiceId,
    advanceBps: raw.advanceBps ?? advanceBps,
    stubAdvanceSats: raw.stubAdvanceSats ?? 0,
    notice: raw.notice ?? 'Advance-intent recorded. No credit moved.'
  }
}

function stub(partial: Partial<OverlayReceivable> & { outputIndex: number }): OverlayReceivable {
  return {
    magic: MAGIC,
    invoiceId: partial.invoiceId ?? '',
    creditor: partial.creditor ?? '',
    debtor: partial.debtor ?? '',
    amountSats: Number(partial.amountSats ?? 0),
    dueDate: partial.dueDate ?? '',
    status: partial.status ?? 'open',
    memo: partial.memo ?? '',
    advanceBps: Number(partial.advanceBps ?? 0),
    txid: partial.txid ?? '',
    outputIndex: partial.outputIndex
  }
}

function fromContext(context: number[] | undefined, outputIndex: number): OverlayReceivable | null {
  if (!context || context.length === 0) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(context))) as OverlayReceivable
    return stub({ ...parsed, outputIndex: parsed.outputIndex ?? outputIndex })
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
