import { Overlay } from '@bsv/simple/browser'
import {
  ADVANCE_BPS,
  LOOKUP_SERVICE,
  MAGIC,
  TOPIC,
  type ReceivablePayload
} from '../../../protocol/receivable'

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

export async function submitReceivableTx(base: string, beef: number[]): Promise<SubmitResult> {
  const url = overlayUrl(base)
  let response: Response
  try {
    response = await fetch(`${url}/submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-topics': TOPIC
      },
      body: JSON.stringify(beef)
    })
  } catch (err) {
    const detail = err instanceof Error && err.message.trim() ? err.message : 'Failed to fetch'
    throw new Error(`${detail} — overlay /submit at ${url}`)
  }
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

export async function lookupReceivables(
  base: string,
  query: ReceivableQuery = {}
): Promise<OverlayReceivable[]> {
  const url = overlayUrl(base)
  try {
    const overlay = await localOverlay(url)
    const outputs = await overlay.lookupOutputs(LOOKUP_SERVICE, query)
    if (outputs.length > 0) {
      return outputs.map((output) =>
        fromContext(output.context, output.outputIndex) ?? stub({ outputIndex: output.outputIndex })
      )
    }
  } catch {
    // Fall through to direct /lookup against the configured node.
  }

  let response: Response
  try {
    response = await fetch(`${url}/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service: LOOKUP_SERVICE,
        query
      })
    })
  } catch (err) {
    const detail = err instanceof Error && err.message.trim() ? err.message : 'Failed to fetch'
    throw new Error(`${detail} — overlay /lookup at ${url}`)
  }
  if (!response.ok) {
    throw new Error(`Overlay /lookup failed (${response.status})`)
  }
  return unwrapLookup(await response.json())
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

function unwrapLookup(body: unknown): OverlayReceivable[] {
  if (Array.isArray(body)) {
    return body.flatMap((item) => {
      if (item && typeof item === 'object' && 'txid' in item && 'outputIndex' in item) {
        const row = item as OverlayReceivable & { context?: number[] }
        return [fromContext(row.context, row.outputIndex) ?? stub(row)]
      }
      return []
    })
  }
  if (body && typeof body === 'object') {
    const typed = body as {
      type?: string
      result?: unknown
      outputs?: Array<{ outputIndex: number, context?: number[] }>
    }
    if (typed.type === 'output-list' && Array.isArray(typed.outputs)) {
      return typed.outputs.map((output) =>
        fromContext(output.context, output.outputIndex) ?? stub({ outputIndex: output.outputIndex })
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
