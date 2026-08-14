import { LockingScript, Transaction } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  BASKET,
  DEMO_EVENT,
  LEGACY_BASKET,
  MAGIC,
  TICKET_TYPE,
  encodeTicketFields
} from '../../../protocol/ticket'
import {
  formatBasketDiagnostic,
  inspectBaskets,
  inspectListedOutputs,
  lockingScriptFromBeef
} from './basket'

function demoFields(serial: string): number[][] {
  return encodeTicketFields({
    eventId: DEMO_EVENT.eventId,
    serial,
    kind: TICKET_TYPE,
    name: DEMO_EVENT.name,
    venue: DEMO_EVENT.venue,
    startsAt: DEMO_EVENT.startsAt
  })
}

function pushdata(bytes: number[]): number[] {
  if (bytes.length <= 75) return [bytes.length, ...bytes]
  if (bytes.length <= 255) return [0x4c, bytes.length, ...bytes]
  throw new Error('test helper only supports pushes up to 255 bytes')
}

function scriptHexFromFields(fields: number[][]): string {
  return fields.flatMap(pushdata).map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function emptySlice(basket: string) {
  return { basket, listed: 0, totalOutputs: 0, spendable: 0, parsed: 0, unparsed: [] }
}

const SAMPLE_PUBKEY = [
  0x02, 0x79, 0xbe, 0x66, 0x7e, 0xf9, 0xdc, 0xbb, 0xac, 0x55, 0xa0, 0x62,
  0x95, 0xce, 0x87, 0x0b, 0x07, 0x02, 0x9b, 0xfc, 0xdb, 0x2d, 0xce, 0x28,
  0xd9, 0x59, 0xf2, 0x81, 0x5b, 0x16, 0xf8, 0x17, 0x98
]

function pushDropBeforeHex(fields: number[][], pubkey = SAMPLE_PUBKEY): string {
  const chunks: number[] = [pubkey.length, ...pubkey, 0xac]
  for (const field of fields) chunks.push(...pushdata(field))
  let left = fields.length
  while (left > 1) {
    chunks.push(0x6d)
    left -= 2
  }
  if (left) chunks.push(0x75)
  return chunks.map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

function ticketTx(serial: string): { tx: Transaction, hex: string, beef: number[] } {
  const hex = scriptHexFromFields(demoFields(serial))
  const tx = new Transaction()
  tx.addOutput({
    satoshis: 1,
    lockingScript: LockingScript.fromHex(hex)
  })
  return { tx, hex, beef: tx.toBEEF() }
}

describe('basket list', () => {
  it('decodes a ticket from listed BEEF when lockingScript is missing', () => {
    const { tx, beef } = ticketTx('3')
    const outpoint = `${tx.id('hex')}.0`
    const { tickets, slice } = inspectListedOutputs(
      [{ outpoint, satoshis: 1 }],
      beef,
      BASKET
    )
    expect(slice.listed).toBe(1)
    expect(tickets).toHaveLength(1)
    expect(tickets[0].ticket.serial).toBe('3')
    expect(tickets[0].ticket.eventId).toBe(DEMO_EVENT.eventId)
    expect(lockingScriptFromBeef(beef, outpoint)).toBeTruthy()
  })

  it('surfaces a diagnostic when outputs exist but none parse as Demo Night tickets', () => {
    const { tickets, slice } = inspectListedOutputs(
      [{ outpoint: 'ab'.repeat(32) + '.0', satoshis: 1 }],
      undefined,
      BASKET
    )
    expect(tickets).toHaveLength(0)
    expect(slice.listed).toBe(1)
    expect(slice.unparsed[0].reason).toMatch(/missing lockingScript/)
    const diagnostic = formatBasketDiagnostic({
      tickets,
      primary: slice,
      legacy: emptySlice(LEGACY_BASKET)
    })
    expect(diagnostic).toContain(`${BASKET} has 1 outputs`)
    expect(diagnostic).toContain('none parsed as Demo Night tickets')
    expect(diagnostic).toMatch(/missing lockingScript/)
  })

  it('lists eventtickets and notes the two-word legacy basket', async () => {
    const primary = ticketTx('1')
    const legacy = ticketTx('9')
    const inspection = await inspectBaskets(async ({ basket, include }) => {
      if (include === 'locking scripts') return { outputs: [] }
      if (basket === BASKET) {
        return {
          outputs: [{ outpoint: `${primary.tx.id('hex')}.0`, satoshis: 1 }],
          BEEF: primary.beef
        }
      }
      if (basket === LEGACY_BASKET) {
        return {
          outputs: [{ outpoint: `${legacy.tx.id('hex')}.0`, satoshis: 1 }],
          BEEF: legacy.beef
        }
      }
      return { outputs: [] }
    })
    expect(inspection.tickets.map((item) => item.ticket.serial).sort()).toEqual(['1', '9'])
    expect(inspection.legacy.listed).toBe(1)
    expect(formatBasketDiagnostic(inspection)).toContain(`Also found 1 in “${LEGACY_BASKET}”`)
  })

  it('never returns a silent empty list when eventtickets has outputs', async () => {
    const inspection = await inspectBaskets(async ({ basket }) => {
      if (basket !== BASKET) return { outputs: [] }
      return {
        outputs: [
          { outpoint: 'aa'.repeat(32) + '.0', satoshis: 1 },
          { outpoint: 'bb'.repeat(32) + '.1', satoshis: 1 }
        ]
      }
    })
    expect(inspection.tickets).toHaveLength(0)
    expect(inspection.primary.listed).toBe(2)
    expect(formatBasketDiagnostic(inspection)).toContain(`${BASKET} has 2 outputs`)
    expect(formatBasketDiagnostic(inspection)).toContain('none parsed as Demo Night tickets')
  })

  it('keeps encode → PushDrop-shaped fields → parse as a Demo Night ticket', () => {
    const fields = demoFields('7')
    const hex = scriptHexFromFields([...fields, new Array(33).fill(2)])
    const { tickets } = inspectListedOutputs(
      [{ outpoint: 'cc'.repeat(32) + '.0', satoshis: 1, lockingScript: hex }],
      undefined,
      BASKET
    )
    expect(tickets[0]?.ticket.serial).toBe('7')
    expect(tickets[0]?.ticket.magic).toBe(MAGIC)
  })

  it('parses a lock()-before PushDrop script like the 144-byte Desktop tickets', () => {
    const hex = pushDropBeforeHex(demoFields('1'))
    expect(hex.length / 2).toBeGreaterThan(100)
    const { tickets, slice } = inspectListedOutputs(
      [{ outpoint: '9b130aa25533'.padEnd(64, '0') + '.0', satoshis: 1, spendable: true, lockingScript: hex }],
      undefined,
      BASKET
    )
    expect(tickets).toHaveLength(1)
    expect(tickets[0].ticket.serial).toBe('1')
    expect(slice.unparsed).toHaveLength(0)
  })

  it('does not hide a 144-byte spendable script that fails parse', () => {
    const hex = '00'.repeat(144)
    const outpoint = 'eef217e3134b'.padEnd(64, '0') + '.0'
    const { tickets, slice } = inspectListedOutputs(
      [{ outpoint, satoshis: 1, spendable: true, lockingScript: hex }],
      undefined,
      BASKET
    )
    expect(tickets).toHaveLength(0)
    expect(slice.unparsed[0].scriptBytes).toBe(144)
    expect(slice.unparsed[0].reason).toMatch(/144-byte/)
    const diagnostic = formatBasketDiagnostic({
      tickets,
      primary: slice,
      legacy: emptySlice(LEGACY_BASKET)
    })
    expect(diagnostic).toContain(`${BASKET} has 1 outputs`)
    expect(diagnostic).toMatch(/144/)
    expect(diagnostic).not.toMatch(/No tickets yet/)
  })

  it('lists locking scripts when entire-transactions BEEF assembly throws', async () => {
    const hex = pushDropBeforeHex(demoFields('2'))
    const inspection = await inspectBaskets(async ({ basket, include }) => {
      if (basket !== BASKET) return { outputs: [] }
      if (include === 'entire transactions') {
        throw new Error('getValidBeefForKnownTxid failed')
      }
      return {
        totalOutputs: 4,
        outputs: [{
          outpoint: '5117e81dbae6'.padEnd(64, '0') + '.0',
          satoshis: 1,
          spendable: true,
          lockingScript: hex
        }]
      }
    })
    expect(inspection.tickets).toHaveLength(1)
    expect(inspection.tickets[0].ticket.serial).toBe('2')
    expect(inspection.primary.listed).toBe(1)
  })
})
