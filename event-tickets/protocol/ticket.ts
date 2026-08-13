/**
 * Demo Night ticket protocol (PushDrop / BRC-48 fields).
 *
 * Each live ticket is one UTXO. Transfer is a spend that recreates the same
 * serial for a new owner. Redeem is a spend with no replacement ticket output.
 */

export const PROTOCOL_ID: [0, string] = [0, 'tickets']
export const BASKET = 'eventtickets'
export const TOPIC = 'tm_tickets'
export const LOOKUP_SERVICE = 'ls_tickets'
export const MAGIC = 'eventticket'
export const TICKET_TYPE = 'ga'

export const DEMO_EVENT = {
  eventId: 'demonight',
  name: 'Demo Night',
  venue: 'The Overlay',
  startsAt: '2026-08-13T20:00:00Z'
} as const

export type TicketKind = typeof TICKET_TYPE

export interface TicketPayload {
  magic: typeof MAGIC
  eventId: string
  serial: string
  kind: TicketKind
  name: string
  venue: string
  startsAt: string
}

export type TicketAction = 'mint' | 'transfer' | 'redeem' | 'invalid'

export interface Classification {
  action: TicketAction
  admitOutputIndexes: number[]
  reason?: string
}

function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

export function encodeTicketFields(ticket: Omit<TicketPayload, 'magic'>): number[][] {
  const meta = JSON.stringify({
    name: ticket.name,
    venue: ticket.venue,
    startsAt: ticket.startsAt
  })
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(ticket.eventId),
    stringToUtf8Bytes(ticket.serial),
    stringToUtf8Bytes(ticket.kind),
    stringToUtf8Bytes(meta)
  ]
}

export function parseTicketFields(fields: Array<number[] | Uint8Array>): TicketPayload | null {
  if (fields.length < 5) return null
  try {
    const asBytes = (field: number[] | Uint8Array): number[] => Array.from(field)
    const magic = utf8BytesToString(asBytes(fields[0]))
    if (magic !== MAGIC) return null
    const eventId = utf8BytesToString(asBytes(fields[1]))
    const serial = utf8BytesToString(asBytes(fields[2]))
    const kind = utf8BytesToString(asBytes(fields[3]))
    if (!eventId || !serial || kind !== TICKET_TYPE) return null
    const meta = JSON.parse(utf8BytesToString(asBytes(fields[4]))) as {
      name?: string
      venue?: string
      startsAt?: string
    }
    return {
      magic: MAGIC,
      eventId,
      serial,
      kind: TICKET_TYPE,
      name: String(meta.name ?? ''),
      venue: String(meta.venue ?? ''),
      startsAt: String(meta.startsAt ?? '')
    }
  } catch {
    return null
  }
}

export function isDemoEventTicket(ticket: TicketPayload): boolean {
  return ticket.eventId === DEMO_EVENT.eventId && ticket.kind === TICKET_TYPE
}

/**
 * Stateless overlay admission rules:
 * - mint: no previous tickets, N new unique serials for the demo event
 * - transfer: one previous ticket, one new ticket, same event+serial
 * - redeem: one previous ticket, no new ticket outputs
 * Anything else is invalid and must not be admitted.
 */
export function classifyTicketTransaction(
  inputTickets: Array<{ index: number; ticket: TicketPayload }>,
  outputTickets: Array<{ index: number; ticket: TicketPayload }>
): Classification {
  const validInputs = inputTickets.filter(({ ticket }) => isDemoEventTicket(ticket))
  const validOutputs = outputTickets.filter(({ ticket }) => isDemoEventTicket(ticket))

  if (validInputs.length === 0 && validOutputs.length >= 1) {
    const serials = validOutputs.map(({ ticket }) => ticket.serial)
    if (new Set(serials).size !== serials.length) {
      return { action: 'invalid', admitOutputIndexes: [], reason: 'duplicate serials in mint' }
    }
    return {
      action: 'mint',
      admitOutputIndexes: validOutputs.map(({ index }) => index)
    }
  }

  if (validInputs.length === 1 && validOutputs.length === 1) {
    const incoming = validInputs[0].ticket
    const outgoing = validOutputs[0].ticket
    if (incoming.serial !== outgoing.serial || incoming.eventId !== outgoing.eventId) {
      return {
        action: 'invalid',
        admitOutputIndexes: [],
        reason: 'transfer must preserve event and serial'
      }
    }
    return {
      action: 'transfer',
      admitOutputIndexes: [validOutputs[0].index]
    }
  }

  if (validInputs.length === 1 && validOutputs.length === 0) {
    return { action: 'redeem', admitOutputIndexes: [] }
  }

  return {
    action: 'invalid',
    admitOutputIndexes: [],
    reason: 'not a mint, transfer, or redeem of a demo ticket'
  }
}

export function qrPayload(outpoint: string, ticket: TicketPayload): string {
  return JSON.stringify({
    v: 1,
    eventId: ticket.eventId,
    serial: ticket.serial,
    outpoint
  })
}

export function parseQrPayload(raw: string): { outpoint: string; eventId?: string; serial?: string } | null {
  const trimmed = raw.trim()
  if (/^[0-9a-fA-F]{64}\.\d+$/.test(trimmed)) {
    return { outpoint: trimmed }
  }
  try {
    const parsed = JSON.parse(trimmed) as { outpoint?: string; eventId?: string; serial?: string }
    if (typeof parsed.outpoint === 'string' && parsed.outpoint.includes('.')) {
      return parsed as { outpoint: string; eventId?: string; serial?: string }
    }
  } catch {
    return null
  }
  return null
}
