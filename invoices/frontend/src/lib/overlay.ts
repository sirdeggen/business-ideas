import { Overlay } from '@bsv/simple/browser'
import { LookupResolver, PushDrop, Transaction } from '@bsv/sdk'
import {
  LOOKUP_SERVICE,
  MAGIC,
  PUBLIC_LOOKUP,
  PUBLIC_TOPIC,
  TOPIC,
  assertPayable,
  joinInvoiceRecords,
  overlayServicesFor,
  parseInvoiceFields,
  parseReceiptFields,
  type InvoiceStatus,
  type JoinedInvoice
} from '../../../protocol/invoice'

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

interface AnyQuery {
  txid?: string
  limit?: number
  skip?: number
  sortOrder?: 'asc' | 'desc'
}

interface BeefOutput {
  beef: number[]
  outputIndex: number
  txid?: string
  context?: number[]
}

const PUBLIC_PAGE_SIZE = 50
const PUBLIC_MAX_PAGES = 20
const LOOKUP_TIMEOUT_MS = 10_000

function overlayUrl(base: string): string {
  return base.replace(/\/$/, '')
}

async function overlayClient(url: string, topic: string, lookup: string): Promise<Overlay> {
  return Overlay.create({
    topics: [topic],
    network: 'mainnet',
    hostOverrides: {
      [topic]: [url],
      [lookup]: [url],
      // SHIP discovery for TopicBroadcaster — query this host instead of public trackers.
      ls_ship: [url]
    }
  })
}

function txFromBeef(beef: number[]): Transaction {
  try {
    return Transaction.fromBEEF(beef)
  } catch {
    return Transaction.fromAtomicBEEF(beef)
  }
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
  const { url, topic, lookup, local } = overlayServicesFor(base)
  if (!local) {
    try {
      const overlay = await overlayClient(url, topic, lookup)
      const tx = txFromBeef(beef)
      const result = await overlay.broadcast(tx)
      if (result.success) {
        const admitted = protocolOutputIndexes(tx)
        return { admitted: admitted.length > 0 ? admitted : [0], raw: result }
      }
    } catch {
      // SHIP discovery can fail; fall through to a direct /submit.
    }
  }
  return submitDirect(url, topic, beef)
}

async function submitDirect(url: string, topic: string, beef: number[]): Promise<SubmitResult> {
  const response = await fetch(`${overlayUrl(url)}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-topics': topic
    },
    body: JSON.stringify(beef)
  })
  const raw: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = (raw as { message?: string } | undefined)?.message
    throw new Error(message || `Overlay /submit failed (${response.status})`)
  }
  const topicResult = (raw as Record<string, { outputsToAdmit?: number[] }>)?.[topic]
  const admitted = topicResult?.outputsToAdmit ?? []
  if (admitted.length > 0) return { admitted, raw }
  // tm_anytx admits any valid PushDrop; some hosts omit STEAK indexes on 200.
  if (topic === PUBLIC_TOPIC) {
    try {
      const indexes = protocolOutputIndexes(txFromBeef(beef))
      if (indexes.length > 0) return { admitted: indexes, raw }
    } catch {
      return { admitted: [0], raw }
    }
  }
  return { admitted, raw }
}

export async function lookupInvoices(
  base: string,
  query: InvoiceLookupQuery
): Promise<OverlayInvoice[]> {
  const { url, local } = overlayServicesFor(base)
  if (local) {
    const records = await lookupLocal(url, query)
    if (query.forPay) assertPayable(records[0])
    return records
  }

  const records = await lookupPublic(url, query)
  if (query.forPay) assertPayable(records[0])
  return records
}

async function lookupLocal(
  url: string,
  query: InvoiceLookupQuery
): Promise<OverlayInvoice[]> {
  if (query.forPay) {
    return lookupDirect(url, query)
  }

  try {
    const overlay = await overlayClient(url, TOPIC, LOOKUP_SERVICE)
    const outputs = await overlay.lookupOutputs(LOOKUP_SERVICE, query)
    if (outputs.length > 0) {
      const parsed = outputs.map((output) =>
        fromContext(output.context, output.outputIndex)
      ).filter((row): row is OverlayInvoice => row !== null)
      if (parsed.length > 0) return parsed
    }
  } catch {
    // Fall through to direct /lookup against the configured node.
  }

  return lookupDirect(url, query)
}

async function lookupDirect(
  url: string,
  query: InvoiceLookupQuery
): Promise<OverlayInvoice[]> {
  const response = await fetch(`${overlayUrl(url)}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: LOOKUP_SERVICE,
      query
    })
  })
  const raw: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = (raw as { message?: string, error?: string } | undefined)?.message
      || (raw as { error?: string } | undefined)?.error
    throw new Error(message || `Overlay /lookup failed (${response.status})`)
  }
  return unwrapLookup(raw)
}

async function lookupPublic(
  url: string,
  query: InvoiceLookupQuery
): Promise<OverlayInvoice[]> {
  const host = overlayUrl(url)
  const createTxid = query.txid
    || (query.outpoint ? query.outpoint.split('.')[0] : undefined)

  const seen = new Set<string>()
  const indexedInvoices: Parameters<typeof joinInvoiceRecords>[0] = []
  const indexedReceipts: Parameters<typeof joinInvoiceRecords>[1] = []

  const ingest = (outputs: BeefOutput[]): void => {
    for (const output of outputs) {
      const decoded = decodeBeefOutput(output)
      if (!decoded) continue
      const key = `${decoded.txid}.${decoded.outputIndex}`
      if (seen.has(key)) continue
      seen.add(key)
      if (decoded.invoice) {
        indexedInvoices.push({
          invoice: decoded.invoice,
          txid: decoded.txid,
          outputIndex: decoded.outputIndex
        })
      }
      if (decoded.receipt) {
        indexedReceipts.push({
          receipt: decoded.receipt,
          txid: decoded.txid,
          outputIndex: decoded.outputIndex
        })
      }
    }
  }

  if (createTxid) {
    ingest(await queryAnytx(host, { txid: createTxid }))
  }

  for (let page = 0; page < PUBLIC_MAX_PAGES; page++) {
    const rows = await queryAnytx(host, {
      limit: PUBLIC_PAGE_SIZE,
      skip: page * PUBLIC_PAGE_SIZE,
      sortOrder: 'desc'
    })
    ingest(rows)

    const wantedReceipt = query.invoiceId
      ? indexedReceipts.find((row) => row.receipt.invoiceId === query.invoiceId)
      : undefined
    const wantedInvoice = query.invoiceId
      ? indexedInvoices.find((row) => row.invoice.invoiceId === query.invoiceId)
      : undefined
    if (wantedReceipt && !wantedInvoice) {
      const referenced = wantedReceipt.receipt.invoiceOutpoint.split('.')[0]
      if (referenced && referenced !== createTxid) {
        ingest(await queryAnytx(host, { txid: referenced }))
      }
    }

    const haveInvoice = !query.invoiceId || indexedInvoices.some((row) => row.invoice.invoiceId === query.invoiceId)
    const haveReceipt = !query.invoiceId || indexedReceipts.some((row) => row.receipt.invoiceId === query.invoiceId)
    if (query.invoiceId && haveInvoice && haveReceipt) break
    if (rows.length < PUBLIC_PAGE_SIZE) break
  }

  let joined = joinInvoiceRecords(indexedInvoices, indexedReceipts).map(fromJoined)
  if (query.invoiceId) joined = joined.filter((row) => row.invoiceId === query.invoiceId)
  if (query.payeeIdentity) joined = joined.filter((row) => row.payeeIdentity === query.payeeIdentity)
  if (query.status) joined = joined.filter((row) => row.status === query.status)
  if (query.outpoint) {
    joined = joined.filter((row) => `${row.txid}.${row.outputIndex}` === query.outpoint)
  }
  return joined
}

async function queryAnytx(url: string, query: AnyQuery): Promise<BeefOutput[]> {
  try {
    const resolver = new LookupResolver({
      networkPreset: 'mainnet',
      hostOverrides: { [PUBLIC_LOOKUP]: [url] }
    })
    const answer = await resolver.query({ service: PUBLIC_LOOKUP, query }, LOOKUP_TIMEOUT_MS)
    if (answer.type === 'output-list') return answer.outputs
  } catch {
    // Fall through to Overlay, then direct /lookup.
  }

  try {
    const overlay = await overlayClient(url, PUBLIC_TOPIC, PUBLIC_LOOKUP)
    return await overlay.lookupOutputs(PUBLIC_LOOKUP, query)
  } catch {
    // Fall through to direct /lookup against the configured node.
  }

  return lookupAnytxDirect(url, query)
}

async function lookupAnytxDirect(url: string, query: AnyQuery): Promise<BeefOutput[]> {
  const response = await fetch(`${overlayUrl(url)}/lookup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service: PUBLIC_LOOKUP,
      query
    })
  })
  const raw: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = (raw as { message?: string, error?: string } | undefined)?.message
      || (raw as { error?: string } | undefined)?.error
    throw new Error(message || `Overlay /lookup failed (${response.status})`)
  }
  return outputsFromLookupAnswer(raw)
}

function decodeBeefOutput(output: BeefOutput): {
  txid: string
  outputIndex: number
  invoice: ReturnType<typeof parseInvoiceFields>
  receipt: ReturnType<typeof parseReceiptFields>
} | null {
  if (!Array.isArray(output.beef) || output.beef.length === 0) return null
  try {
    const tx = txFromBeef(output.beef)
    const lockingScript = tx.outputs[output.outputIndex]?.lockingScript
    if (!lockingScript) return null
    const fields = PushDrop.decode(lockingScript).fields
    return {
      txid: output.txid || tx.id('hex'),
      outputIndex: output.outputIndex,
      invoice: parseInvoiceFields(fields),
      receipt: parseReceiptFields(fields)
    }
  } catch {
    return null
  }
}

function outputsFromLookupAnswer(body: unknown): BeefOutput[] {
  if (body && typeof body === 'object') {
    const typed = body as {
      type?: string
      outputs?: BeefOutput[]
      result?: unknown
      message?: string
      error?: string
    }
    if (typeof typed.message === 'string' && typed.message.length > 0) {
      throw new Error(typed.message)
    }
    if (typeof typed.error === 'string' && typed.error.length > 0) {
      throw new Error(typed.error)
    }
    if (typed.type === 'output-list' && Array.isArray(typed.outputs)) {
      return typed.outputs.filter((output) => Array.isArray(output.beef))
    }
    if (Array.isArray(typed.result)) return outputsFromLookupAnswer(typed.result)
  }
  return []
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

function unwrapLookup(body: unknown): OverlayInvoice[] {
  if (Array.isArray(body)) {
    return body.flatMap((item) => {
      if (item && typeof item === 'object' && 'txid' in item && 'outputIndex' in item) {
        const row = item as OverlayInvoice & { context?: number[] }
        return [fromContext(row.context, row.outputIndex) ?? invoiceStub(row)]
      }
      return []
    })
  }
  if (body && typeof body === 'object') {
    const typed = body as {
      type?: string
      result?: unknown
      outputs?: Array<{ outputIndex: number, context?: number[] }>
      message?: string
      error?: string
    }
    if (typeof typed.message === 'string' && typed.message.length > 0) {
      throw new Error(typed.message)
    }
    if (typeof typed.error === 'string' && typed.error.length > 0) {
      throw new Error(typed.error)
    }
    if (typed.type === 'output-list' && Array.isArray(typed.outputs)) {
      return typed.outputs.map((output) =>
        fromContext(output.context, output.outputIndex) ?? invoiceStub({ outputIndex: output.outputIndex })
      )
    }
    if (Array.isArray(typed.result)) return unwrapLookup(typed.result)
  }
  return []
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
