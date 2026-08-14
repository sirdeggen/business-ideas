import { LockingScript, Transaction } from '@bsv/sdk'
import { describe, expect, it } from 'vitest'
import {
  BASKET,
  MAGIC,
  encodeReceivableFields,
  type ReceivablePayload
} from '../../../protocol/receivable'
import {
  formatBasketDiagnostic,
  inspectBaskets,
  inspectListedOutputs,
  lockingScriptFromBeef,
  unionChaseRows
} from './basket'

const CREDITOR = '02' + 'ab'.repeat(32)
const DEBTOR = '03' + 'cd'.repeat(32)

function invoice(partial: Partial<ReceivablePayload> = {}): ReceivablePayload {
  return {
    magic: MAGIC,
    invoiceId: 'QA-0813-DESK',
    creditor: CREDITOR,
    debtor: DEBTOR,
    amountSats: 245,
    dueDate: '2026-09-30',
    status: 'open',
    memo: 'desk qa',
    advanceBps: 0,
    ...partial
  }
}

function invoiceFields(partial: Partial<ReceivablePayload> = {}): number[][] {
  return encodeReceivableFields(invoice(partial))
}

function pushdata(bytes: number[]): number[] {
  if (bytes.length <= 75) return [bytes.length, ...bytes]
  if (bytes.length <= 255) return [0x4c, bytes.length, ...bytes]
  throw new Error('test helper only supports pushes up to 255 bytes')
}

function scriptHexFromFields(fields: number[][]): string {
  return fields.flatMap(pushdata).map((byte) => byte.toString(16).padStart(2, '0')).join('')
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

function invoiceTx(partial: Partial<ReceivablePayload> = {}): { tx: Transaction, hex: string, beef: number[] } {
  const hex = scriptHexFromFields(invoiceFields(partial))
  const tx = new Transaction()
  tx.addOutput({
    satoshis: 1,
    lockingScript: LockingScript.fromHex(hex)
  })
  return { tx, hex, beef: tx.toBEEF() }
}

describe('receivables basket list', () => {
  it('decodes an invoice from listed BEEF when lockingScript is missing', () => {
    const { tx, beef } = invoiceTx()
    const outpoint = `${tx.id('hex')}.0`
    const { held, slice } = inspectListedOutputs(
      [{ outpoint, satoshis: 1 }],
      beef,
      BASKET
    )
    expect(slice.listed).toBe(1)
    expect(held).toHaveLength(1)
    expect(held[0].item.invoiceId).toBe('QA-0813-DESK')
    expect(lockingScriptFromBeef(beef, outpoint)).toBeTruthy()
  })

  it('surfaces a diagnostic when outputs exist but none parse as invoices', () => {
    const { held, slice } = inspectListedOutputs(
      [{ outpoint: 'ab'.repeat(32) + '.0', satoshis: 1 }],
      undefined,
      BASKET
    )
    expect(held).toHaveLength(0)
    expect(slice.listed).toBe(1)
    expect(slice.unparsed[0].reason).toMatch(/missing lockingScript/)
    const diagnostic = formatBasketDiagnostic({
      held,
      primary: slice
    })
    expect(diagnostic).toContain('listed 1, none parsed as invoices')
    expect(diagnostic).toMatch(/missing lockingScript/)
  })

  it('never returns a silent empty list when receivables has outputs', async () => {
    const inspection = await inspectBaskets(async ({ basket }) => {
      if (basket !== BASKET) return { outputs: [] }
      return {
        outputs: [
          { outpoint: 'aa'.repeat(32) + '.0', satoshis: 1 },
          { outpoint: 'bb'.repeat(32) + '.1', satoshis: 1 }
        ]
      }
    })
    expect(inspection.held).toHaveLength(0)
    expect(inspection.primary.listed).toBe(2)
    expect(formatBasketDiagnostic(inspection)).toContain('listed 2, none parsed as invoices')
  })

  it('parses a lock()-before PushDrop script with MAGIC not at field[0]', () => {
    const hex = pushDropBeforeHex(invoiceFields({ invoiceId: 'QA-0813-DESK' }))
    const { held, slice } = inspectListedOutputs(
      [{ outpoint: '9b130aa25533'.padEnd(64, '0') + '.0', satoshis: 1, spendable: true, lockingScript: hex }],
      undefined,
      BASKET
    )
    expect(held).toHaveLength(1)
    expect(held[0].item.invoiceId).toBe('QA-0813-DESK')
    expect(slice.unparsed).toHaveLength(0)
  })

  it('lists locking scripts when entire-transactions BEEF assembly throws', async () => {
    const hex = pushDropBeforeHex(invoiceFields({ invoiceId: 'INV-BEEF' }))
    const inspection = await inspectBaskets(async ({ basket, include }) => {
      if (basket !== BASKET) return { outputs: [] }
      if (include === 'entire transactions') {
        throw new Error('getValidBeefForKnownTxid failed')
      }
      return {
        totalOutputs: 2,
        outputs: [{
          outpoint: '5117e81dbae6'.padEnd(64, '0') + '.0',
          satoshis: 1,
          spendable: true,
          lockingScript: hex
        }]
      }
    })
    expect(inspection.held).toHaveLength(1)
    expect(inspection.held[0].item.invoiceId).toBe('INV-BEEF')
    expect(inspection.primary.listed).toBe(1)
  })

  it('unions overlay rows with held basket items so Chase is not empty', () => {
    const { tx } = invoiceTx({ invoiceId: 'QA-0813-DESK' })
    const held = [{
      outpoint: `${tx.id('hex')}.0`,
      satoshis: 1,
      item: invoice(),
      customInstructions: ''
    }]
    const rows = unionChaseRows([], held)
    expect(rows).toHaveLength(1)
    expect(rows[0].invoiceId).toBe('QA-0813-DESK')
    expect(formatBasketDiagnostic({
      held,
      primary: { basket: BASKET, listed: 1, totalOutputs: 1, spendable: 1, parsed: 1, unparsed: [] }
    })).toBe('')
  })

  it('dedupes the same invoice on identity or outpoint and prefers the name', () => {
    const hex = invoice()
    const named = invoice({ debtor: 'QA Debtor', amountSats: 245 })
    const overlay = { ...hex, amountSats: 1, txid: 'aa'.repeat(32), outputIndex: 0 }
    const remembered = { ...named, txid: 'bb'.repeat(32), outputIndex: 1 }
    const rows = unionChaseRows([overlay], [], [remembered])
    expect(rows).toHaveLength(1)
    expect(rows[0].invoiceId).toBe('QA-0813-DESK')
    expect(rows[0].debtor).toBe('QA Debtor')
    expect(rows[0].amountSats).toBe(245)
  })
})
