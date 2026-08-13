import { Overlay } from '@bsv/simple/browser'
import { DEMO_EVENT, LOOKUP_SERVICE, MAGIC, TICKET_TYPE, TOPIC } from '../../../protocol/ticket'
import type { TicketPayload } from '../../../protocol/ticket'

export interface OverlayTicket extends TicketPayload {
  txid: string
  outputIndex: number
  createdAt?: string
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

export async function submitTicketTx(base: string, beef: number[]): Promise<SubmitResult> {
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

export async function lookupTickets(
  base: string,
  query: { outpoint?: string, serial?: string, eventId?: string }
): Promise<OverlayTicket[]> {
  const url = overlayUrl(base)
  try {
    const overlay = await localOverlay(url)
    const outputs = await overlay.lookupOutputs(LOOKUP_SERVICE, query)
    if (outputs.length > 0) {
      return outputs.map((output) =>
        fromContext(output.context, output.outputIndex) ?? ticketStub({ outputIndex: output.outputIndex })
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

function ticketStub(partial: Partial<OverlayTicket> & { outputIndex: number }): OverlayTicket {
  return {
    magic: MAGIC,
    eventId: typeof partial.eventId === 'string' ? partial.eventId : DEMO_EVENT.eventId,
    serial: typeof partial.serial === 'string' ? partial.serial : '',
    kind: TICKET_TYPE,
    name: typeof partial.name === 'string' ? partial.name : DEMO_EVENT.name,
    venue: typeof partial.venue === 'string' ? partial.venue : DEMO_EVENT.venue,
    startsAt: typeof partial.startsAt === 'string' ? partial.startsAt : DEMO_EVENT.startsAt,
    txid: typeof partial.txid === 'string' ? partial.txid : '',
    outputIndex: partial.outputIndex,
    createdAt: partial.createdAt
  }
}

function fromContext(context: number[] | undefined, outputIndex: number): OverlayTicket | null {
  if (!context || context.length === 0) return null
  try {
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(context))) as OverlayTicket
    return ticketStub({ ...parsed, outputIndex: parsed.outputIndex ?? outputIndex })
  } catch {
    return null
  }
}

function unwrapLookup(body: unknown): OverlayTicket[] {
  if (Array.isArray(body)) {
    return body.flatMap((item) => {
      if (item && typeof item === 'object' && 'txid' in item && 'outputIndex' in item) {
        const row = item as OverlayTicket & { context?: number[] }
        return [fromContext(row.context, row.outputIndex) ?? ticketStub(row)]
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
        fromContext(output.context, output.outputIndex) ?? ticketStub({ outputIndex: output.outputIndex })
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
