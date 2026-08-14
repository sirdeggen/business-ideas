import { describe, expect, it } from 'vitest'
import {
  DEMO_EVENT,
  MAGIC,
  TICKET_TYPE,
  classifyTicketTransaction,
  encodeTicketFields,
  explainTicketParse,
  parseQrPayload,
  parseTicketFields,
  qrPayload,
  type TicketPayload
} from './ticket'

function demoTicket(serial: string): TicketPayload {
  return {
    magic: MAGIC,
    eventId: DEMO_EVENT.eventId,
    serial,
    kind: TICKET_TYPE,
    name: DEMO_EVENT.name,
    venue: DEMO_EVENT.venue,
    startsAt: DEMO_EVENT.startsAt
  }
}

describe('ticket protocol', () => {
  it('round-trips PushDrop fields', () => {
    const fields = encodeTicketFields(demoTicket('7'))
    expect(parseTicketFields(fields)).toEqual(demoTicket('7'))
  })

  it('parses the older 61-byte magic/eventId/serial shape without kind/meta', () => {
    const compact = [
      Array.from(new TextEncoder().encode(MAGIC)),
      Array.from(new TextEncoder().encode(DEMO_EVENT.eventId)),
      [1]
    ]
    const parsed = parseTicketFields(compact)
    expect(parsed?.serial).toBe('1')
    expect(parsed?.eventId).toBe(DEMO_EVENT.eventId)
    expect(parsed?.kind).toBe(TICKET_TYPE)
    expect(parsed?.name).toBe(DEMO_EVENT.name)
  })

  it('still parses a Demo Night ticket when lock() adds extra fields', () => {
    const fields = encodeTicketFields(demoTicket('7'))
    const pubkey = new Array(33).fill(2)
    const signature = new Array(71).fill(3)
    expect(parseTicketFields([...fields, pubkey, signature])).toEqual(demoTicket('7'))
    expect(parseTicketFields([pubkey, ...fields, signature])).toEqual(demoTicket('7'))
    expect(parseTicketFields([pubkey, signature, ...fields])).toEqual(demoTicket('7'))
  })

  it('accepts magic/eventId/serial/kind when venue meta is displaced by lock() fields', () => {
    const fields = encodeTicketFields(demoTicket('4'))
    const pubkey = new Array(33).fill(2)
    const displaced = [fields[0], fields[1], fields[2], fields[3], pubkey, fields[4]]
    expect(parseTicketFields(displaced)).toEqual(demoTicket('4'))
  })

  it('explains why parse failed', () => {
    const fields = encodeTicketFields(demoTicket('1'))
    fields[0] = Array.from(new TextEncoder().encode('notaticket'))
    expect(parseTicketFields(fields)).toBeNull()
    expect(explainTicketParse(fields)).toMatch(/magic mismatch/)
    expect(explainTicketParse([])).toMatch(/0 fields/)
  })

  it('rejects the wrong magic or ticket type', () => {
    const fields = encodeTicketFields(demoTicket('1'))
    fields[0] = Array.from(new TextEncoder().encode('notaticket'))
    expect(parseTicketFields(fields)).toBeNull()
  })

  it('classifies mint, transfer, and redeem', () => {
    const mint = classifyTicketTransaction(
      [],
      [
        { index: 0, ticket: demoTicket('1') },
        { index: 1, ticket: demoTicket('2') }
      ]
    )
    expect(mint).toEqual({ action: 'mint', admitOutputIndexes: [0, 1] })

    const transfer = classifyTicketTransaction(
      [{ index: 0, ticket: demoTicket('1') }],
      [{ index: 0, ticket: demoTicket('1') }]
    )
    expect(transfer).toEqual({ action: 'transfer', admitOutputIndexes: [0] })

    const redeem = classifyTicketTransaction(
      [{ index: 0, ticket: demoTicket('1') }],
      []
    )
    expect(redeem).toEqual({ action: 'redeem', admitOutputIndexes: [] })
  })

  it('rejects spent-style transfers that change the serial', () => {
    const result = classifyTicketTransaction(
      [{ index: 0, ticket: demoTicket('1') }],
      [{ index: 0, ticket: demoTicket('99') }]
    )
    expect(result.action).toBe('invalid')
    expect(result.admitOutputIndexes).toEqual([])
  })

  it('rejects a mint that is not the demo event', () => {
    const other: TicketPayload = { ...demoTicket('1'), eventId: 'other-show' }
    const result = classifyTicketTransaction([], [{ index: 0, ticket: other }])
    expect(result.action).toBe('invalid')
    expect(result.admitOutputIndexes).toEqual([])
  })

  it('rejects a two-input spend that is not a single-ticket transfer or redeem', () => {
    const result = classifyTicketTransaction(
      [
        { index: 0, ticket: demoTicket('1') },
        { index: 1, ticket: demoTicket('2') }
      ],
      [{ index: 0, ticket: demoTicket('1') }]
    )
    expect(result.action).toBe('invalid')
  })

  it('encodes a door QR that can be scanned as JSON or a raw outpoint', () => {
    const payload = qrPayload('ab'.repeat(32) + '.0', demoTicket('3'))
    expect(parseQrPayload(payload)?.serial).toBe('3')
    expect(parseQrPayload('ab'.repeat(32) + '.2')?.outpoint).toMatch(/\.2$/)
  })
})
