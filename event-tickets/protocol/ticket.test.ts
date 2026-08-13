import { describe, expect, it } from 'vitest'
import {
  DEMO_EVENT,
  MAGIC,
  TICKET_TYPE,
  classifyTicketTransaction,
  encodeTicketFields,
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
