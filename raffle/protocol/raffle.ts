/**
 * Offsite draw protocol (PushDrop / BRC-48 fields).
 *
 * A host starts one trip draw (header UTXO). Everyone at the offsite takes a
 * free stub. If one-per-person is off, a stub can be handed to a coworker.
 * The host draws one live stub in the room. Not a sold raffle, not a casino.
 */

import { sha256Hex } from './sha256'

export const PROTOCOL_ID: [0, string] = [0, 'raffle']
export const BASKET = 'raffle'
export const TOPIC = 'tm_raffle'
export const LOOKUP_SERVICE = 'ls_raffle'
export const MAGIC = 'raffle'
export const SCHEMA_VERSION = '1'
export const CLAIMABLE = 'claimable'
export const TITLE_MAX = 120
export const PRIZE_MAX = 160
export const PRIZE_VALUE_MAX = 40
export const WHO_MAX = 200
export const DRAW_NOTE_MAX = 120
export const HOST_NAME_MAX = 80
export const HOLDER_NAME_MAX = 80
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
  prize: string
  prizeValue: string
  whoCanEnter: string
  ticketCount: number
  onePerPerson: boolean
  transferable: boolean
  drawNote: string
  mustBePresent: boolean
  hostName: string
  timestamp: string
}

export interface RaffleTicket {
  magic: typeof MAGIC
  version: typeof SCHEMA_VERSION
  kind: 'ticket'
  raffleId: string
  ticketIndex: number
  holder: string
  holderName: string
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
  winnerName: string
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

function yesNo(value: boolean): string {
  return value ? 'yes' : 'no'
}

function parseYesNo(value: string | undefined, fallback: boolean): boolean {
  const raw = (value ?? '').trim().toLowerCase()
  if (raw === 'yes' || raw === 'true' || raw === '1') return true
  if (raw === 'no' || raw === 'false' || raw === '0') return false
  return fallback
}

export function hostFirstName(name: string): string {
  const trimmed = name.trim()
  if (!trimmed) return ''
  return trimmed.split(/\s+/)[0] ?? ''
}

export function raffleHash(header: Omit<RaffleHeader, 'magic' | 'version' | 'kind'>): string {
  return sha256Hex([
    header.raffleId,
    header.host,
    header.title,
    header.prize,
    header.prizeValue,
    header.whoCanEnter,
    String(header.ticketCount),
    yesNo(header.onePerPerson),
    header.drawNote,
    yesNo(header.mustBePresent),
    header.hostName,
    header.timestamp
  ].join('\n'))
}

export function makeRaffleId(host: string, title: string, timestamp: string, nonce = ''): string {
  return sha256Hex(`${host}|${title}|${timestamp}|${nonce}`).slice(0, 32)
}

export function encodeHeaderFields(header: Omit<RaffleHeader, 'magic' | 'version' | 'kind'>): number[][] {
  const onePerPerson = header.onePerPerson ?? !header.transferable
  const fields = [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('header'),
    stringToUtf8Bytes(header.raffleId),
    stringToUtf8Bytes(header.host),
    stringToUtf8Bytes(header.title),
    stringToUtf8Bytes(header.prize),
    stringToUtf8Bytes(header.whoCanEnter),
    stringToUtf8Bytes(String(header.ticketCount)),
    stringToUtf8Bytes(yesNo(onePerPerson)),
    stringToUtf8Bytes(header.drawNote),
    stringToUtf8Bytes(yesNo(header.mustBePresent)),
    stringToUtf8Bytes(header.hostName),
    stringToUtf8Bytes(header.timestamp)
  ]
  if (header.prizeValue) fields.push(stringToUtf8Bytes(header.prizeValue))
  return fields
}

export function encodeTicketFields(ticket: Omit<RaffleTicket, 'magic' | 'version' | 'kind'>): number[][] {
  const fields = [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('ticket'),
    stringToUtf8Bytes(ticket.raffleId),
    stringToUtf8Bytes(String(ticket.ticketIndex)),
    stringToUtf8Bytes(ticket.holder),
    stringToUtf8Bytes(ticket.holderName ?? ''),
    stringToUtf8Bytes(ticket.timestamp)
  ]
  if (ticket.keyID) fields.push(stringToUtf8Bytes(ticket.keyID))
  if (ticket.sender) fields.push(stringToUtf8Bytes(ticket.sender))
  return fields
}

export function encodeDrawFields(draw: Omit<RaffleDraw, 'magic' | 'version' | 'kind'>): number[][] {
  const fields = [
    stringToUtf8Bytes(MAGIC),
    stringToUtf8Bytes(SCHEMA_VERSION),
    stringToUtf8Bytes('draw'),
    stringToUtf8Bytes(draw.raffleId),
    stringToUtf8Bytes(draw.winningOutpoint),
    stringToUtf8Bytes(String(draw.winningIndex)),
    stringToUtf8Bytes(draw.timestamp)
  ]
  if (draw.winnerName) fields.push(stringToUtf8Bytes(draw.winnerName))
  return fields
}

function headerFromParts(parts: {
  raffleId: string
  host: string
  title: string
  prize: string
  prizeValue: string
  whoCanEnter: string
  ticketCount: number
  onePerPerson: boolean
  drawNote: string
  mustBePresent: boolean
  hostName: string
  timestamp: string
}): RaffleHeader | null {
  const header: RaffleHeader = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'header',
    raffleId: parts.raffleId,
    host: parts.host,
    title: parts.title,
    prize: parts.prize,
    prizeValue: parts.prizeValue,
    whoCanEnter: parts.whoCanEnter,
    ticketCount: parts.ticketCount,
    onePerPerson: parts.onePerPerson,
    transferable: !parts.onePerPerson,
    drawNote: parts.drawNote,
    mustBePresent: parts.mustBePresent,
    hostName: parts.hostName,
    timestamp: parts.timestamp
  }
  return validateHeader(header) ? null : header
}

function parseHeader(rest: string[]): RaffleHeader | null {
  if (rest.length < 8) return null
  const ticketCountNew = Number(rest[5])
  const ticketCountOld = Number(rest[4])

  if (rest.length >= 11 && Number.isInteger(ticketCountNew)) {
    return headerFromParts({
      raffleId: rest[0],
      host: rest[1],
      title: rest[2],
      prize: rest[3] ?? '',
      whoCanEnter: rest[4] ?? '',
      ticketCount: ticketCountNew,
      onePerPerson: parseYesNo(rest[6], true),
      drawNote: rest[7] ?? '',
      mustBePresent: parseYesNo(rest[8], true),
      hostName: rest[9] ?? '',
      timestamp: rest[10] ?? '',
      prizeValue: rest[11] ?? ''
    })
  }

  if (!Number.isInteger(ticketCountOld)) return null
  const transferable = parseYesNo(rest[5], false)
  return headerFromParts({
    raffleId: rest[0],
    host: rest[1],
    title: rest[2],
    prize: rest[2] ?? '',
    whoCanEnter: rest[3] ?? '',
    ticketCount: ticketCountOld,
    onePerPerson: !transferable,
    drawNote: rest[6] ?? '',
    mustBePresent: true,
    hostName: '',
    timestamp: rest[8] ?? '',
    prizeValue: ''
  })
}

function parseTicket(rest: string[]): RaffleTicket | null {
  if (rest.length < 4) return null
  const ticketIndex = Number(rest[1])
  if (!Number.isInteger(ticketIndex)) return null
  const third = rest[3] ?? ''
  const named = third.length > 0 && !ISO_TIME.test(third)
  const holderName = named ? third : ''
  const timestamp = named ? (rest[4] ?? '') : third
  const keyID = named ? rest[5] : rest[4]
  const sender = named ? rest[6] : rest[5]
  const ticket: RaffleTicket = {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'ticket',
    raffleId: rest[0],
    ticketIndex,
    holder: rest[2],
    holderName,
    timestamp,
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

  let winnerName = ''
  if (OUTPOINT.test(second)) {
    winningOutpoint = second
    const maybeIndex = Number(rest[2])
    if (rest[2] && Number.isInteger(maybeIndex)) {
      winningIndex = maybeIndex
      timestamp = rest[3] ?? ''
      winnerName = rest[4] ?? ''
    } else {
      timestamp = rest[2] ?? ''
      winnerName = rest[3] ?? ''
    }
  } else if (Number.isInteger(Number(second))) {
    winningIndex = Number(second)
    timestamp = rest[2] ?? ''
    winnerName = rest[3] ?? ''
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
    winnerName,
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
    return `event name must be 1–${TITLE_MAX} characters`
  }
  if (!header.prize.trim() || header.prize.trim().length > PRIZE_MAX) {
    return `prize must be 1–${PRIZE_MAX} characters`
  }
  if (header.prizeValue.trim().length > PRIZE_VALUE_MAX) {
    return `prize value must be ≤${PRIZE_VALUE_MAX} characters`
  }
  if (header.whoCanEnter.trim().length > WHO_MAX) return `who can take a ticket must be ≤${WHO_MAX} characters`
  if (!Number.isInteger(header.ticketCount) || header.ticketCount < TICKET_MIN || header.ticketCount > TICKET_MAX) {
    return `ticket count must be ${TICKET_MIN}–${TICKET_MAX}`
  }
  if (header.drawNote.trim().length > DRAW_NOTE_MAX) return `when we draw must be ≤${DRAW_NOTE_MAX} characters`
  if (header.hostName.trim().length > HOST_NAME_MAX) {
    return `host name must be ≤${HOST_NAME_MAX} characters`
  }
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
  if (ticket.holderName.trim().length > HOLDER_NAME_MAX) {
    return `name on the stub must be ≤${HOLDER_NAME_MAX} characters`
  }
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
  if (draw.winnerName.trim().length > HOLDER_NAME_MAX) return `winner name must be ≤${HOLDER_NAME_MAX} characters`
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

export function takenCount(header: Pick<RaffleHeader, 'ticketCount'>, tickets: RaffleTicket[]): number {
  return header.ticketCount - remainingCount(header, tickets)
}

export function holderAlreadyHasStub(tickets: RaffleTicket[], identityKey: string): boolean {
  if (!identityKey) return false
  return latestTickets(tickets).some((ticket) => ticket.holder === identityKey)
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
