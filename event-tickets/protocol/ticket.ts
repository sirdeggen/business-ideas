/**
 * Demo Night ticket protocol (PushDrop / BRC-48 fields).
 *
 * Each live ticket is one UTXO. Transfer is a spend that recreates the same
 * serial for a new owner. Redeem is a spend with no replacement ticket output.
 */

export const PROTOCOL_ID: [0, string] = [0, 'tickets']
export const BASKET = 'eventtickets'
/** Older Desktop mints also landed in this two-word basket. Read-only; new mints use BASKET. */
export const LEGACY_BASKET = 'event tickets'
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

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

function magicIndex(fields: Array<number[] | Uint8Array>): number {
  return fields.findIndex((field) => {
    try {
      return fieldUtf8(field) === MAGIC
    } catch {
      return false
    }
  })
}

function metaFromFields(
  fields: Array<number[] | Uint8Array>,
  start: number
): { name: string, venue: string, startsAt: string } {
  for (let i = start + 4; i < fields.length; i++) {
    try {
      const meta = JSON.parse(fieldUtf8(fields[i])) as {
        name?: string
        venue?: string
        startsAt?: string
      }
      if (meta && typeof meta === 'object') {
        return {
          name: String(meta.name ?? ''),
          venue: String(meta.venue ?? ''),
          startsAt: String(meta.startsAt ?? '')
        }
      }
    } catch {
      // lock() may insert a pubkey/signature before or after venue meta.
    }
  }
  return { name: '', venue: '', startsAt: '' }
}

/**
 * Accepts encodeTicketFields() plus extra PushDrop.lock() fields (pubkey /
 * signature before or after the ticket). Requires magic, eventId, serial, kind.
 */
export function parseTicketFields(fields: Array<number[] | Uint8Array>): TicketPayload | null {
  const start = magicIndex(fields)
  if (start < 0 || start + 3 >= fields.length) return null
  try {
    const eventId = fieldUtf8(fields[start + 1])
    const serial = fieldUtf8(fields[start + 2])
    const kind = fieldUtf8(fields[start + 3])
    if (!eventId || !serial || kind !== TICKET_TYPE) return null
    const meta = metaFromFields(fields, start)
    return {
      magic: MAGIC,
      eventId,
      serial,
      kind: TICKET_TYPE,
      name: meta.name,
      venue: meta.venue,
      startsAt: meta.startsAt
    }
  } catch {
    return null
  }
}

/** Why parseTicketFields returned null — used when a basket is non-empty but blind. */
export function explainTicketParse(fields: Array<number[] | Uint8Array>): string {
  if (fields.length === 0) return 'PushDrop has 0 fields'
  const start = magicIndex(fields)
  if (start < 0) {
    const preview = fields.slice(0, 4).map((field, index) => {
      try {
        const text = fieldUtf8(field)
        if (text.length > 0 && text.length <= 32 && /^[\x20-\x7e]+$/.test(text)) {
          return text
        }
      } catch {
        // Fall through to byte count.
      }
      return `field[${index}] ${Array.from(field).length}B`
    })
    return `magic mismatch (no ${MAGIC}; ${preview.join(', ')})`
  }
  if (start + 3 >= fields.length) {
    return `fields after ${MAGIC} incomplete (${fields.length - start} from magic, need eventId/serial/kind)`
  }
  try {
    const eventId = fieldUtf8(fields[start + 1])
    const serial = fieldUtf8(fields[start + 2])
    const kind = fieldUtf8(fields[start + 3])
    if (!eventId) return 'empty eventId'
    if (!serial) return 'empty serial'
    if (kind !== TICKET_TYPE) return `kind ${JSON.stringify(kind)} ≠ ${TICKET_TYPE}`
  } catch (error) {
    return error instanceof Error ? error.message : 'field decode failed'
  }
  return 'unknown parse failure'
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
