/**
 * Raffle protocol (PushDrop / BRC-48 fields).
 *
 * A host starts one raffle (header UTXO). Guests claim tickets as their own
 * UTXOs. A transferable ticket is spent and recreated for a new holder.
 * The host draws by announcing one live ticket. Not a pot, not a casino.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'raffle']
export const BASKET = 'raffle'
export const TOPIC = 'tm_raffle'
export const LOOKUP_SERVICE = 'ls_raffle'
export const MAGIC = 'raffle'
export const SCHEMA_VERSION = '1'
export const CLAIMABLE = 'claimable'
export const TITLE_MAX = 80
export const WHO_MAX = 200
export const DRAW_NOTE_MAX = 120
export const TERMS_MAX = 500
export const TICKET_MIN = 1
export const TICKET_MAX = 100

export const KINDS = ['header', 'ticket', 'draw'] as const
export type RaffleKind = (typeof KINDS)[number]

export interface RaffleHeader {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'header'
  raffleId: string
  host: string
  title: string
  whoCanEnter: string
  ticketCount: number
  transferable: boolean
  drawNote: string
  terms: string
  timestamp: string
}

export interface RaffleTicket {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'ticket'
  raffleId: string
  ticketIndex: number
  holder: string
  timestamp: string
  keyID?: string
  sender?: string
}

export interface RaffleDraw {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'draw'
  raffleId: string
  winningOutpoint: string
  winningIndex: number
  timestamp: string
}

export type RafflePayload = RaffleHeader | RaffleTicket | RaffleDraw

export type RaffleAction = 'start' | 'claim' | 'transfer' | 'draw' | 'invalid'

export interface Classification {
  action: RaffleAction
  admitOutputIndexes: number[]
  reason?: string
}

const IDENTITY_KEY = /^(02|03)[0-9a-fA-F]{64}$/
const RAFFLE_ID = /^[0-9a-f]{16,64}$/
const OUTPOINT = /^[0-9a-fA-F]{64}\.\d+$/
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/

export function isIdentityKey(value: string): boolean {
  return IDENTITY_KEY.test(value.trim())
}

export function isRaffleId(value: string): boolean {
  return RAFFLE_ID.test(value.trim())
}

export function isHolder(value: string): boolean {
  const trimmed = value.trim()
  return trimmed === CLAIMABLE || isIdentityKey(trimmed)
}

function utf8BytesToString(bytes: number[]): string {
  return new TextDecoder().decode(Uint8Array.from(bytes))
}

function stringToUtf8Bytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value))
}

function fieldUtf8(field: number[] | Uint8Array): string {
  return utf8BytesToString(Array.from(field))
}

function isPrintableUtf8(bytes: number[]): boolean {
  return bytes.length > 0 && bytes.every((byte) => byte >= 0x09 && byte <= 0x7e)
}

function looksLikeLockPadding(field: number[] | Uint8Array): boolean {
  const bytes = Array.from(field)
  if (isPrintableUtf8(bytes)) return false
  // PushDrop.lock() appends a 33-byte compressed pubkey and a DER signature.
  if (bytes.length === 33 && (bytes[0] === 2 || bytes[0] === 3)) return true
  if (bytes.length >= 64 && bytes.length <= 80) return true
  return false
}

function semanticFields(fields: Array<number[] | Uint8Array>): Array<number[] | Uint8Array> {
  return fields.filter((field) => !looksLikeLockPadding(field))
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

export function raffleHash(header: Omit<RaffleHeader, 'magic' | 'version' | 'kind'>): string {
  return sha256Hex([
    header.raffleId,
    header.host,
    header.title,
    header.whoCanEnter,
    String(header.ticketCount),
    header.transferable ? 'yes' : 'no',
    header.drawNote,
    header.terms,
    header.timestamp
  ].join('\n'))
}

export function makeRaffleId(host: string, title: string, timestamp: string, nonce = ''): string {
  return sha256Hex(`${host}|${title}|${timestamp}|${nonce}`).slice(0, 32)
}

export function encodeHeaderFields(header: Omit<RaffleHeader, 'magic' | 'version' | 'kind'>): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('header'),
    stringToUtf8Bytes(header.raffleId),
    stringToUtf8Bytes(header.host),
    stringToUtf8Bytes(header.title),
    stringToUtf8Bytes(header.whoCanEnter),
    stringToUtf8Bytes(String(header.ticketCount)),
    stringToUtf8Bytes(header.transferable ? 'yes' : 'no'),
    stringToUtf8Bytes(header.drawNote),
    stringToUtf8Bytes(header.terms),
    stringToUtf8Bytes(header.timestamp)
  ]
}

export function encodeTicketFields(ticket: Omit<RaffleTicket, 'magic' | 'version' | 'kind'>): number[][] {
  const fields = [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('ticket'),
    stringToUtf8Bytes(ticket.raffleId),
    stringToUtf8Bytes(String(ticket.ticketIndex)),
    stringToUtf8Bytes(ticket.holder),
    stringToUtf8Bytes(ticket.timestamp)
  ]
  if (ticket.keyID) fields.push(stringToUtf8Bytes(ticket.keyID))
  if (ticket.sender) fields.push(stringToUtf8Bytes(ticket.sender))
  return fields
}

export function encodeDrawFields(draw: Omit<RaffleDraw, 'magic' | 'version' | 'kind'>): number[][] {
  return [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('draw'),
    stringToUtf8Bytes(draw.raffleId),
    stringToUtf8Bytes(draw.winningOutpoint),
    stringToUtf8Bytes(String(draw.winningIndex)),
    stringToUtf8Bytes(draw.timestamp)
  ]
}

function parseHeader(rest: string[]): RaffleHeader | null {
  if (rest.length < 8) return null
  const [
    raffleId,
    host,
    title,
    whoCanEnter,
    ticketCountRaw,
    transferableRaw,
    drawNote,
    terms,
    timestamp
  ] = rest
  const ticketCount = Number(ticketCountRaw)
  if (!Number.isInteger(ticketCount)) return null
  const header: RaffleHeader = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'header',
    raffleId,
    host,
    title,
    whoCanEnter: whoCanEnter ?? '',
    ticketCount,
    transferable: transferableRaw === 'yes' || transferableRaw === 'true' || transferableRaw === '1',
    drawNote: drawNote ?? '',
    terms: terms ?? '',
    timestamp: timestamp ?? ''
  }
  return validateHeader(header) ? null : header
}

function parseTicket(rest: string[]): RaffleTicket | null {
  if (rest.length < 4) return null
  const [raffleId, indexRaw, holder, timestamp, keyID, sender] = rest
  const ticketIndex = Number(indexRaw)
  if (!Number.isInteger(ticketIndex)) return null
  const ticket: RaffleTicket = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'ticket',
    raffleId,
    ticketIndex,
    holder,
    timestamp: timestamp ?? '',
    ...(keyID ? { keyID } : {}),
    ...(sender ? { sender } : {})
  }
  return validateTicket(ticket) ? null : ticket
}

function parseDraw(rest: string[]): RaffleDraw | null {
  if (rest.length < 2) return null
  const raffleId = rest[0]
  const second = rest[1]
  let winningOutpoint = ''
  let winningIndex = 0
  let timestamp = ''

  if (OUTPOINT.test(second)) {
    winningOutpoint = second
    const maybeIndex = Number(rest[2])
    if (rest[2] && Number.isInteger(maybeIndex)) {
      winningIndex = maybeIndex
      timestamp = rest[3] ?? ''
    } else {
      timestamp = rest[2] ?? ''
    }
  } else if (Number.isInteger(Number(second))) {
    winningIndex = Number(second)
    timestamp = rest[2] ?? ''
  } else {
    return null
  }

  const draw: RaffleDraw = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'draw',
    raffleId,
    winningOutpoint,
    winningIndex,
    timestamp
  }
  return validateDraw(draw) ? null : draw
}

/**
 * Accepts the live encode() shapes plus lock() pubkey/signature padding
 * before or after the raffle fields. Extra unknown fields after the payload
 * are ignored.
 */
export function parseRaffleFields(fields: Array<number[] | Uint8Array>): RafflePayload | null {
  const start = magicIndex(fields)
  if (start < 0) return null
  const sliced = semanticFields(fields.slice(start))
  if (sliced.length < 4) return null
  try {
    const version = fieldUtf8(sliced[1])
    if (version !== SCHEMA_VERSION) return null
    const kind = fieldUtf8(sliced[2]) as RaffleKind
    const rest = sliced.slice(3).map((field) => fieldUtf8(field))
    if (kind === 'header') return parseHeader(rest)
    if (kind === 'ticket') return parseTicket(rest)
    if (kind === 'draw') return parseDraw(rest)
    return null
  } catch {
    return null
  }
}

export function validateHeader(header: RaffleHeader): string | null {
  if (header.magic !== MAGIC) return 'magic mismatch'
  if (header.version !== SCHEMA_VERSION) return 'unsupported version'
  if (header.kind !== 'header') return 'not a header'
  if (!isRaffleId(header.raffleId)) return 'raffle id must be 16–64 hex'
  if (!isIdentityKey(header.host)) return 'host must be a 66-hex identity key'
  if (!header.title.trim() || header.title.trim().length > TITLE_MAX) {
    return `title must be 1–${TITLE_MAX} characters`
  }
  if (header.whoCanEnter.trim().length > WHO_MAX) return `who can enter must be ≤${WHO_MAX} characters`
  if (!Number.isInteger(header.ticketCount) || header.ticketCount < TICKET_MIN || header.ticketCount > TICKET_MAX) {
    return `ticket count must be ${TICKET_MIN}–${TICKET_MAX}`
  }
  if (header.drawNote.trim().length > DRAW_NOTE_MAX) return `draw note must be ≤${DRAW_NOTE_MAX} characters`
  if (header.terms.trim().length > TERMS_MAX) return `terms must be ≤${TERMS_MAX} characters`
  if (header.timestamp && !ISO_TIME.test(header.timestamp)) return 'timestamp must be ISO-8601 UTC'
  return null
}

export function validateTicket(ticket: RaffleTicket): string | null {
  if (ticket.magic !== MAGIC) return 'magic mismatch'
  if (ticket.version !== SCHEMA_VERSION) return 'unsupported version'
  if (ticket.kind !== 'ticket') return 'not a ticket'
  if (!isRaffleId(ticket.raffleId)) return 'raffle id must be 16–64 hex'
  if (!Number.isInteger(ticket.ticketIndex) || ticket.ticketIndex < 1 || ticket.ticketIndex > TICKET_MAX) {
    return `ticket index must be 1–${TICKET_MAX}`
  }
  if (!isHolder(ticket.holder)) return 'holder must be claimable or a 66-hex identity key'
  if (ticket.timestamp && !ISO_TIME.test(ticket.timestamp)) return 'timestamp must be ISO-8601 UTC'
  if (ticket.sender && !isIdentityKey(ticket.sender)) return 'sender must be a 66-hex identity key'
  return null
}

export function validateDraw(draw: RaffleDraw): string | null {
  if (draw.magic !== MAGIC) return 'magic mismatch'
  if (draw.version !== SCHEMA_VERSION) return 'unsupported version'
  if (draw.kind !== 'draw') return 'not a draw'
  if (!isRaffleId(draw.raffleId)) return 'raffle id must be 16–64 hex'
  const hasOutpoint = OUTPOINT.test(draw.winningOutpoint)
  const hasIndex = Number.isInteger(draw.winningIndex) && draw.winningIndex >= 1
  if (!hasOutpoint && !hasIndex) return 'draw must name a winning outpoint or ticket index'
  if (draw.timestamp && !ISO_TIME.test(draw.timestamp)) return 'timestamp must be ISO-8601 UTC'
  return null
}

export function validatePayload(payload: RafflePayload): string | null {
  if (payload.kind === 'header') return validateHeader(payload)
  if (payload.kind === 'ticket') return validateTicket(payload)
  return validateDraw(payload)
}

export function latestTickets<T extends RaffleTicket>(tickets: T[]): T[] {
  const byIndex = new Map<number, T>()
  for (const ticket of tickets) {
    const previous = byIndex.get(ticket.ticketIndex)
    if (!previous || ticket.timestamp >= previous.timestamp) {
      byIndex.set(ticket.ticketIndex, ticket)
    }
  }
  return [...byIndex.values()].sort((a, b) => a.ticketIndex - b.ticketIndex)
}

export function liveTickets<T extends RaffleTicket & { txid?: string, outputIndex?: number }>(
  tickets: T[],
  draws: Array<Pick<RaffleDraw, 'winningOutpoint' | 'winningIndex'>>
): T[] {
  const drawnOutpoints = new Set(draws.map((draw) => draw.winningOutpoint).filter(Boolean))
  const drawnIndexes = new Set(draws.map((draw) => draw.winningIndex).filter((index) => index > 0))
  return latestTickets(tickets).filter((ticket) => {
    const outpoint = ticket.txid != null && ticket.outputIndex != null
      ? `${ticket.txid}.${ticket.outputIndex}`
      : ''
    if (outpoint && drawnOutpoints.has(outpoint)) return false
    if (drawnIndexes.has(ticket.ticketIndex)) return false
    return true
  })
}

export function remainingCount(header: Pick<RaffleHeader, 'ticketCount'>, tickets: RaffleTicket[]): number {
  const claimed = new Set(latestTickets(tickets).map((ticket) => ticket.ticketIndex))
  return Math.max(0, header.ticketCount - claimed.size)
}

export function nextTicketIndex(header: Pick<RaffleHeader, 'ticketCount'>, tickets: RaffleTicket[]): number | null {
  const claimed = new Set(latestTickets(tickets).map((ticket) => ticket.ticketIndex))
  for (let index = 1; index <= header.ticketCount; index++) {
    if (!claimed.has(index)) return index
  }
  return null
}

export function classifyRaffleTransaction(
  inputItems: Array<{ index: number, item: RafflePayload }>,
  outputItems: Array<{ index: number, item: RafflePayload }>
): Classification {
  const headers = outputItems.filter(({ item }) => item.kind === 'header')
  const ticketsOut = outputItems.filter(({ item }) => item.kind === 'ticket')
  const draws = outputItems.filter(({ item }) => item.kind === 'draw')
  const ticketsIn = inputItems.filter(({ item }) => item.kind === 'ticket')

  if (inputItems.length === 0 && headers.length === 1 && draws.length === 0) {
    const header = headers[0].item as RaffleHeader
    if (validateHeader(header)) {
      return { action: 'invalid', admitOutputIndexes: [], reason: validateHeader(header) ?? 'invalid header' }
    }
    const extras = ticketsOut.filter(({ item }) => (item as RaffleTicket).raffleId !== header.raffleId)
    if (extras.length > 0) {
      return { action: 'invalid', admitOutputIndexes: [], reason: 'minted tickets must match the raffle' }
    }
    return {
      action: 'start',
      admitOutputIndexes: [headers[0].index, ...ticketsOut.map(({ index }) => index)]
    }
  }

  if (ticketsIn.length === 0 && ticketsOut.length === 1 && headers.length === 0 && draws.length === 0) {
    const ticket = ticketsOut[0].item as RaffleTicket
    if (validateTicket(ticket)) {
      return { action: 'invalid', admitOutputIndexes: [], reason: validateTicket(ticket) ?? 'invalid ticket' }
    }
    return { action: 'claim', admitOutputIndexes: [ticketsOut[0].index] }
  }

  if (ticketsIn.length === 1 && ticketsOut.length === 1 && headers.length === 0 && draws.length === 0) {
    const incoming = ticketsIn[0].item as RaffleTicket
    const outgoing = ticketsOut[0].item as RaffleTicket
    if (incoming.raffleId !== outgoing.raffleId || incoming.ticketIndex !== outgoing.ticketIndex) {
      return {
        action: 'invalid',
        admitOutputIndexes: [],
        reason: 'transfer must keep raffle id and ticket index'
      }
    }
    return { action: 'transfer', admitOutputIndexes: [ticketsOut[0].index] }
  }

  if (draws.length === 1 && headers.length === 0 && ticketsOut.length === 0) {
    const draw = draws[0].item as RaffleDraw
    if (validateDraw(draw)) {
      return { action: 'invalid', admitOutputIndexes: [], reason: validateDraw(draw) ?? 'invalid draw' }
    }
    return { action: 'draw', admitOutputIndexes: [draws[0].index] }
  }

  return {
    action: 'invalid',
    admitOutputIndexes: [],
    reason: 'not a raffle start, claim, transfer, or draw'
  }
}
