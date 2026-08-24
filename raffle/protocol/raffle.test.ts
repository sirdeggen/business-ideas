import { describe, expect, it } from 'vitest'
import {
  CLAIMABLE,
  MAGIC,
  SCHEMA_VERSION,
  classifyRaffleTransaction,
  encodeDrawFields,
  encodeHeaderFields,
  encodeTicketFields,
  liveTickets,
  makeRaffleId,
  nextTicketIndex,
  parseRaffleFields,
  raffleHash,
  remainingCount,
  validateDraw,
  validateHeader,
  validateTicket,
  type RaffleDraw,
  type RaffleHeader,
  type RaffleTicket
} from './raffle'

const HOST = `02${'ab'.repeat(32)}`
const GUEST = `03${'cd'.repeat(32)}`
const OUTPOINT = `${'ab'.repeat(32)}.0`

function header(partial: Partial<RaffleHeader> = {}): RaffleHeader {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'header',
    raffleId: 'a'.repeat(32),
    host: HOST,
    title: 'Office tombola',
    whoCanEnter: 'Anyone with this link',
    ticketCount: 8,
    transferable: true,
    drawNote: 'We draw together on Friday',
    terms: '',
    timestamp: '2026-08-24T12:00:00Z',
    ...partial
  }
}

function ticket(partial: Partial<RaffleTicket> = {}): RaffleTicket {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'ticket',
    raffleId: 'a'.repeat(32),
    ticketIndex: 1,
    holder: GUEST,
    timestamp: '2026-08-24T12:01:00Z',
    ...partial
  }
}

function draw(partial: Partial<RaffleDraw> = {}): RaffleDraw {
  return {
    magic: MAGIC,
    version: SCHEMA_VERSION,
    kind: 'draw',
    raffleId: 'a'.repeat(32),
    winningOutpoint: OUTPOINT,
    winningIndex: 1,
    timestamp: '2026-08-24T12:05:00Z',
    ...partial
  }
}

describe('raffle protocol', () => {
  it('round-trips header, ticket, and draw fields', () => {
    expect(parseRaffleFields(encodeHeaderFields(header()))).toEqual(header())
    expect(parseRaffleFields(encodeTicketFields(ticket()))).toEqual(ticket())
    expect(parseRaffleFields(encodeDrawFields(draw()))).toEqual(draw())
  })

  it('still parses when lock() adds pubkey and signature fields', () => {
    const fields = encodeHeaderFields(header())
    const pubkey = new Array(33).fill(2)
    const signature = new Array(71).fill(3)
    expect(parseRaffleFields([...fields, pubkey, signature])).toEqual(header())
    expect(parseRaffleFields([pubkey, ...fields, signature])).toEqual(header())
    expect(parseRaffleFields([pubkey, signature, ...fields])).toEqual(header())
  })

  it('parses a draw that only names a ticket index', () => {
    const compact = encodeDrawFields({
      raffleId: 'a'.repeat(32),
      winningOutpoint: '',
      winningIndex: 4,
      timestamp: '2026-08-24T12:05:00Z'
    })
    compact.splice(4, 1)
    const parsed = parseRaffleFields(compact)
    expect(parsed?.kind).toBe('draw')
    if (parsed?.kind === 'draw') expect(parsed.winningIndex).toBe(4)
  })

  it('validates host, title, ticket count, and holder', () => {
    expect(validateHeader(header())).toBeNull()
    expect(validateHeader(header({ host: 'not-a-key' }))).toMatch(/host/)
    expect(validateHeader(header({ title: '' }))).toMatch(/title/)
    expect(validateHeader(header({ ticketCount: 0 }))).toMatch(/ticket count/)
    expect(validateHeader(header({ ticketCount: 101 }))).toMatch(/ticket count/)
    expect(validateTicket(ticket())).toBeNull()
    expect(validateTicket(ticket({ holder: CLAIMABLE }))).toBeNull()
    expect(validateTicket(ticket({ holder: 'bob' }))).toMatch(/holder/)
    expect(validateDraw(draw())).toBeNull()
    expect(validateDraw(draw({ winningOutpoint: '', winningIndex: 0 }))).toMatch(/winning/)
  })

  it('rejects the wrong magic', () => {
    const fields = encodeTicketFields(ticket())
    fields[0] = Array.from(new TextEncoder().encode('eventticket'))
    expect(parseRaffleFields(fields)).toBeNull()
  })

  it('hashes and lists a raffle id', () => {
    const id = makeRaffleId(HOST, 'Office tombola', '2026-08-24T12:00:00Z', 'n1')
    expect(id).toMatch(/^[0-9a-f]{32}$/)
    expect(raffleHash(header())).toMatch(/^[0-9a-f]{64}$/)
  })

  it('counts remaining tickets and picks the next index', () => {
    const tickets = [ticket({ ticketIndex: 1 }), ticket({ ticketIndex: 3 })]
    expect(remainingCount(header({ ticketCount: 4 }), tickets)).toBe(2)
    expect(nextTicketIndex(header({ ticketCount: 4 }), tickets)).toBe(2)
    expect(nextTicketIndex(header({ ticketCount: 2 }), [
      ticket({ ticketIndex: 1 }),
      ticket({ ticketIndex: 2 })
    ])).toBeNull()
  })

  it('drops drawn tickets from the live set', () => {
    const live = liveTickets(
      [
        { ...ticket({ ticketIndex: 1 }), txid: 'ab'.repeat(32), outputIndex: 0 },
        { ...ticket({ ticketIndex: 2 }), txid: 'cd'.repeat(32), outputIndex: 1 }
      ],
      [draw({ winningOutpoint: `${'ab'.repeat(32)}.0`, winningIndex: 1 })]
    )
    expect(live).toHaveLength(1)
    expect(live[0].ticketIndex).toBe(2)
  })

  it('classifies start, claim, transfer, and draw', () => {
    expect(classifyRaffleTransaction([], [
      { index: 0, item: header() },
      { index: 1, item: ticket({ holder: CLAIMABLE }) }
    ])).toEqual({ action: 'start', admitOutputIndexes: [0, 1] })

    expect(classifyRaffleTransaction([], [
      { index: 2, item: ticket() }
    ])).toEqual({ action: 'claim', admitOutputIndexes: [2] })

    expect(classifyRaffleTransaction(
      [{ index: 0, item: ticket({ holder: GUEST }) }],
      [{ index: 0, item: ticket({ holder: HOST, ticketIndex: 1 }) }]
    )).toEqual({ action: 'transfer', admitOutputIndexes: [0] })

    expect(classifyRaffleTransaction([], [
      { index: 0, item: draw() }
    ])).toEqual({ action: 'draw', admitOutputIndexes: [0] })
  })

  it('rejects a transfer that changes the ticket index', () => {
    const result = classifyRaffleTransaction(
      [{ index: 0, item: ticket({ ticketIndex: 1 }) }],
      [{ index: 0, item: ticket({ ticketIndex: 2 }) }]
    )
    expect(result.action).toBe('invalid')
    expect(result.admitOutputIndexes).toEqual([])
  })
})
