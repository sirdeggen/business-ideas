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

function receivableOutputIndexes(tx: Transaction): number[] {
  const indexes: number[] = []
  for (const [index, output] of tx.outputs.entries()) {
    try {
      if (parseReceivableFields(PushDrop.decode(output.lockingScript).fields)) {
        indexes.push(index)
      }
    } catch {
      // Payment and change outputs are ignored.
    }
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
    raw: result
  }
}

export async function lookupReceivables(
  base: string,
  query: ReceivableQuery = {}
): Promise<OverlayReceivable[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const resolver = createResolver(host, service)
  const answers = usesPublicAnytx(host)
    ? await queryAnytx(resolver, service, query)
    : [await resolver.query({ service, query }, 15000)]

  const rows = answers.flatMap(receivablesFromAnswer)
  return rows.filter((row) => matchesReceivableQuery(row, query))
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

function receivablesFromAnswer(answer: LookupAnswer): OverlayReceivable[] {
  if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) return []
  return answer.outputs.flatMap((output) => {
    const fromScript = receivableFromBeef(output.beef, output.outputIndex)
    if (fromScript) return [fromScript]
    const fromCtx = fromContext(output.context, output.outputIndex)
    return fromCtx ? [fromCtx] : []
  })
}

function receivableFromBeef(beef: number[] | undefined, outputIndex: number): OverlayReceivable | null {
  if (!beef || beef.length === 0) return null
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    const item = parseReceivableFields(PushDrop.decode(output.lockingScript).fields)
    if (!item) return null
    return {
      ...item,
      txid: tx.id('hex'),
      outputIndex
    }
  } catch {
    return null
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

export async function pingOverlay(base: string): Promise<boolean> {
  try {
    const response = await fetch(`${overlayUrl(base)}/version`)
    if (response.ok) return true
    const health = await fetch(`${overlayUrl(base)}/health/live`)
    return health.ok
  } catch {
    return false
  }
}
