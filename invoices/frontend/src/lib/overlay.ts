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
  assertPayable,
  joinInvoiceRecords,
  parseInvoiceFields,
  parseReceiptFields,
  type InvoiceStatus,
  type JoinedInvoice
} from '../../../protocol/invoice'
import {
  PUBLIC_LOOKUP,
  PUBLIC_TOPIC,
  isLocalhostUrl
} from './config'

export interface OverlayInvoice {
  magic: typeof MAGIC
  invoiceId: string
  payeeIdentity: string
  amountSats: number
  memo: string
  dueDate: string
  createdAt: string
  orgName: string
  billedTo: string
  amountUsd: string
  status: InvoiceStatus
  txid: string
  outputIndex: number
  paymentTxid?: string
  paymentOutputIndex?: number
  receiptTxid?: string
  receiptOutputIndex?: number
  payerIdentity?: string
  paidAt?: string
}

export interface SubmitResult {
  admitted: number[]
  raw: unknown
}

export interface InvoiceLookupQuery {
  outpoint?: string
  invoiceId?: string
  payeeIdentity?: string
  status?: InvoiceStatus
  forPay?: boolean
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

function protocolOutputIndexes(tx: Transaction): number[] {
  const indexes: number[] = []
  for (const [index, output] of tx.outputs.entries()) {
    try {
      const fields = PushDrop.decode(output.lockingScript).fields
      if (parseInvoiceFields(fields) || parseReceiptFields(fields)) indexes.push(index)
    } catch {
      // Change and BRC-29 payment outputs are ignored.
    }
  }
  return indexes
}

export async function submitInvoiceTx(base: string, beef: number[]): Promise<SubmitResult> {
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
    admitted: protocolOutputIndexes(tx),
    raw: result
  }
}

export async function lookupInvoices(
  base: string,
  query: InvoiceLookupQuery = {}
): Promise<OverlayInvoice[]> {
  const host = overlayUrl(base)
  const service = overlayLookupService(host)
  const resolver = createResolver(host, service)
  const rows = usesPublicAnytx(host)
    ? await lookupPublic(resolver, service, query)
    : invoicesFromAnswer(await resolver.query({ service, query }, 15000))

  const filtered = rows.filter((row) => matchesInvoiceQuery(row, query))
  if (query.forPay) assertPayable(filtered[0])
  return filtered
}

async function lookupPublic(
  resolver: LookupResolver,
  service: string,
  query: InvoiceLookupQuery
): Promise<OverlayInvoice[]> {
  const answers = await queryAnytx(resolver, service, query)
  let [invoices, receipts] = collectIndexed(answers)
  if (query.invoiceId) {
    const receipt = receipts.find((row) => row.receipt.invoiceId === query.invoiceId)
    const invoice = invoices.find((row) => row.invoice.invoiceId === query.invoiceId)
    if (receipt && !invoice) {
      const createTxid = receipt.receipt.invoiceOutpoint.split('.')[0]
      if (createTxid) {
        const extra = await resolver.query({ service, query: { txid: createTxid } }, 20000)
        ;[invoices, receipts] = collectIndexed([...answers, extra])
      }
    }
  }
  return joinInvoiceRecords(invoices, receipts).map(fromJoined)
}

async function queryAnytx(
  resolver: LookupResolver,
  service: string,
  query: InvoiceLookupQuery
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

function collectIndexed(answers: LookupAnswer[]): [
  Parameters<typeof joinInvoiceRecords>[0],
  Parameters<typeof joinInvoiceRecords>[1]
] {
  const invoices: Parameters<typeof joinInvoiceRecords>[0] = []
  const receipts: Parameters<typeof joinInvoiceRecords>[1] = []
  const seen = new Set<string>()

  for (const answer of answers) {
    if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) continue
    for (const output of answer.outputs) {
      const decoded = decodeBeefOutput(output.beef, output.outputIndex, output.txid)
      if (!decoded) continue
      const key = `${decoded.txid}.${decoded.outputIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      if (decoded.invoice) {
        invoices.push({
          invoice: decoded.invoice,
          txid: decoded.txid,
          outputIndex: decoded.outputIndex
        })
      }
      if (decoded.receipt) {
        receipts.push({
          receipt: decoded.receipt,
          txid: decoded.txid,
          outputIndex: decoded.outputIndex
        })
      }
    }
  }

  return [invoices, receipts]
}

function decodeBeefOutput(
  beef: number[] | undefined,
  outputIndex: number,
  txidHint?: string
): {
  txid: string
  outputIndex: number
  invoice: ReturnType<typeof parseInvoiceFields>
  receipt: ReturnType<typeof parseReceiptFields>
} | null {
  if (!beef || beef.length === 0) return null
  try {
    const tx = Transaction.fromBEEF(beef)
    const output = tx.outputs[outputIndex]
    if (!output) return null
    const fields = PushDrop.decode(output.lockingScript).fields
    return {
      txid: txidHint || tx.id('hex'),
      outputIndex,
      invoice: parseInvoiceFields(fields),
      receipt: parseReceiptFields(fields)
    }
  } catch {
    return null
  }
}

function invoicesFromAnswer(answer: LookupAnswer): OverlayInvoice[] {
  if (answer.type !== 'output-list' || !Array.isArray(answer.outputs)) return []
  return answer.outputs.flatMap((output) => {
    const fromCtx = fromContext(output.context, output.outputIndex)
    if (fromCtx) return [fromCtx]
    const decoded = decodeBeefOutput(output.beef, output.outputIndex, output.txid)
    if (decoded?.invoice) {
      return [fromJoined({
        ...decoded.invoice,
        status: 'open',
        txid: decoded.txid,
        outputIndex: decoded.outputIndex
      })]
    }
    return []
  })
}

function matchesInvoiceQuery(row: OverlayInvoice, query: InvoiceLookupQuery): boolean {
  if (query.outpoint) {
    const [txid, vout] = query.outpoint.split('.')
    if (row.txid !== txid || row.outputIndex !== Number(vout)) return false
  }
  if (query.invoiceId && row.invoiceId !== query.invoiceId) return false
  if (query.payeeIdentity && row.payeeIdentity !== query.payeeIdentity) return false
  if (query.status && row.status !== query.status) return false
  return true
}

function invoiceStub(partial: Partial<OverlayInvoice> & { outputIndex: number }): OverlayInvoice {
  return {
    magic: MAGIC,
    invoiceId: typeof partial.invoiceId === 'string' ? partial.invoiceId : '',
    payeeIdentity: typeof partial.payeeIdentity === 'string' ? partial.payeeIdentity : '',
    amountSats: typeof partial.amountSats === 'number' ? partial.amountSats : 0,
    memo: typeof partial.memo === 'string' ? partial.memo : '',
    dueDate: typeof partial.dueDate === 'string' ? partial.dueDate : '',
    createdAt: typeof partial.createdAt === 'string' ? String(partial.createdAt) : '',
    orgName: typeof partial.orgName === 'string' ? partial.orgName : '',
    billedTo: typeof partial.billedTo === 'string' ? partial.billedTo : '',
    amountUsd: typeof partial.amountUsd === 'string' ? partial.amountUsd : '',
    status: partial.status === 'paid' || partial.status === 'voided' ? partial.status : 'open',
    txid: typeof partial.txid === 'string' ? partial.txid : '',
    outputIndex: partial.outputIndex,
    paymentTxid: partial.paymentTxid,
    paymentOutputIndex: partial.paymentOutputIndex,
    receiptTxid: partial.receiptTxid,
    receiptOutputIndex: partial.receiptOutputIndex,
    payerIdentity: partial.payerIdentity,
    paidAt: typeof partial.paidAt === 'string' ? partial.paidAt : undefined
  }
}

function fromJoined(row: JoinedInvoice): OverlayInvoice {
  return invoiceStub(row)
}

function fromContext(context: number[] | undefined, outputIndex: number): OverlayInvoice | null {
  if (!context || context.length === 0) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(context))) as OverlayInvoice
    return invoiceStub({ ...parsed, outputIndex: parsed.outputIndex ?? outputIndex })
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
