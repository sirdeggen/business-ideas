import { Overlay } from '@bsv/simple/browser'
import {
  LOOKUP_SERVICE,
  MAGIC,
  TOPIC,
  assertPayable,
  type InvoiceStatus
} from '../../../protocol/invoice'

export interface OverlayInvoice {
  magic: typeof MAGIC
  invoiceId: string
  payeeIdentity: string
  amountSats: number
  memo: string
  dueDate: string
  createdAt: string
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

function overlayUrl(base: string): string {
  return base.replace(/\/$/, '')
}

async function localOverlay(base: string): Promise<Overlay> {
  const url = overlayUrl(base)
  return Overlay.create({
    topics: [TOPIC],
    network: 'mainnet',
    hostOverrides: {
      [TOPIC]: [url],
      [LOOKUP_SERVICE]: [url]
    }
  })
}

export async function submitInvoiceTx(base: string, beef: number[]): Promise<SubmitResult> {
  const url = overlayUrl(base)
  const response = await fetch(`${url}/submit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-topics': TOPIC
    },
    body: JSON.stringify(beef)
  })
  const raw: unknown = await response.json().catch(() => undefined)
  if (!response.ok) {
    const message = (raw as { message?: string } | undefined)?.message
    throw new Error(message || `Overlay /submit failed (${response.status})`)
  }
  const topicResult = (raw as Record<string, { outputsToAdmit?: number[] }>)?.[TOPIC]
  return {
    admitted: topicResult?.outputsToAdmit ?? [],
    raw
  }
}

export async function lookupInvoices(
  base: string,
  query: {
    outpoint?: string
    invoiceId?: string
    payeeIdentity?: string
    status?: InvoiceStatus
    forPay?: boolean
  }
): Promise<OverlayInvoice[]> {
  const url = overlayUrl(base)
  if (query.forPay) {
    const records = await lookupDirect(url, query)
    assertPayable(records[0])
    return records
  }

  try {
    const overlay = await localOverlay(url)
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
  query: {
    outpoint?: string
    invoiceId?: string
    payeeIdentity?: string
    status?: InvoiceStatus
    forPay?: boolean
  }
): Promise<OverlayInvoice[]> {
  const response = await fetch(`${url}/lookup`, {
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

function invoiceStub(partial: Partial<OverlayInvoice> & { outputIndex: number }): OverlayInvoice {
  return {
    magic: MAGIC,
    invoiceId: typeof partial.invoiceId === 'string' ? partial.invoiceId : '',
    payeeIdentity: typeof partial.payeeIdentity === 'string' ? partial.payeeIdentity : '',
    amountSats: typeof partial.amountSats === 'number' ? partial.amountSats : 0,
    memo: typeof partial.memo === 'string' ? partial.memo : '',
    dueDate: typeof partial.dueDate === 'string' ? partial.dueDate : '',
    createdAt: typeof partial.createdAt === 'string' ? String(partial.createdAt) : '',
    status: partial.status === 'paid' || partial.status === 'voided' ? partial.status : 'open',
    txid: typeof partial.txid === 'string' ? partial.txid : '',
    outputIndex: partial.outputIndex,
    paymentTxid: partial.paymentTxid,
    paymentOutputIndex: partial.paymentOutputIndex,
    receiptTxid: partial.receiptTxid,
    receiptOutputIndex: partial.receiptOutputIndex,
    payerIdentity: partial.payerIdentity,
    paidAt: partial.paidAt
  }
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
