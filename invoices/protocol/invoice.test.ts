import { describe, expect, it } from 'vitest'
import {
  MAGIC,
  PAID_MAGIC,
  assertPayable,
  bindReceiptToInvoice,
  classifyInvoiceTransaction,
  encodeInvoiceFields,
  encodeReceiptFields,
  isIdentityKey,
  parseInvoiceFields,
  parseReceiptFields,
  type InvoicePayload,
  type ReceiptPayload
} from './invoice'

const PAYEE = '025706528f0f6894b2ba505007267ccff1133e004452a1f6b72ac716f246216366'
const PAYER = `03${'11'.repeat(32)}`

function demoInvoice(invoiceId = 'ab'.repeat(16)): InvoicePayload {
  return {
    magic: MAGIC,
    invoiceId,
    payeeIdentity: PAYEE,
    amountSats: 1500,
    memo: 'Choir robes',
    dueDate: '2026-09-01',
    createdAt: '2026-08-13T18:00:00.000Z'
  }
}

function demoReceipt(invoiceId = 'ab'.repeat(16)): ReceiptPayload {
  return {
    magic: PAID_MAGIC,
    invoiceId,
    payeeIdentity: PAYEE,
    payerIdentity: PAYER,
    amountSats: 1500,
    invoiceOutpoint: `${'cd'.repeat(32)}.0`,
    remittance: {
      derivationPrefix: 'prefix',
      derivationSuffix: 'suffix',
      paymentOutputIndex: 0
    }
  }
}

describe('invoice protocol', () => {
  it('round-trips PushDrop invoice fields', () => {
    const fields = encodeInvoiceFields(demoInvoice())
    expect(parseInvoiceFields(fields)).toEqual(demoInvoice())
  })

  it('round-trips PushDrop receipt fields', () => {
    const fields = encodeReceiptFields(demoReceipt())
    expect(parseReceiptFields(fields)).toEqual(demoReceipt())
  })

  it('rejects the wrong magic', () => {
    const fields = encodeInvoiceFields(demoInvoice())
    fields[0] = Array.from(new TextEncoder().encode('notaninvoice'))
    expect(parseInvoiceFields(fields)).toBeNull()
  })

  it('classifies create, pay, and void', () => {
    const create = classifyInvoiceTransaction(
      [],
      [{ index: 0, invoice: demoInvoice() }],
      [],
      [1, 500]
    )
    expect(create).toEqual({ action: 'create', admitOutputIndexes: [0] })

    const pay = classifyInvoiceTransaction(
      [],
      [],
      [{ index: 1, receipt: demoReceipt() }],
      [1500, 1]
    )
    expect(pay).toEqual({ action: 'pay', admitOutputIndexes: [1] })

    const voided = classifyInvoiceTransaction(
      [{ index: 0, invoice: demoInvoice() }],
      [],
      [],
      [500]
    )
    expect(voided).toEqual({ action: 'void', admitOutputIndexes: [] })
  })

  it('rejects a pay whose billed output is the wrong amount', () => {
    const result = classifyInvoiceTransaction(
      [],
      [],
      [{ index: 1, receipt: demoReceipt() }],
      [1499, 1]
    )
    expect(result.action).toBe('invalid')
    expect(result.admitOutputIndexes).toEqual([])
  })

  it('rejects a create with duplicate invoice ids', () => {
    const invoice = demoInvoice()
    const result = classifyInvoiceTransaction(
      [],
      [
        { index: 0, invoice },
        { index: 1, invoice }
      ],
      [],
      [1, 1]
    )
    expect(result.action).toBe('invalid')
  })

  it('rejects paying an invoice that is already paid', () => {
    expect(() => assertPayable({ status: 'paid' })).toThrow(/already paid/)
    expect(() => assertPayable({ status: 'open' })).not.toThrow()
    expect(() => assertPayable(null)).toThrow(/Unknown invoice/)
  })

  it('binds a receipt to the open invoice fields', () => {
    const invoice = demoInvoice()
    expect(() => bindReceiptToInvoice(invoice, demoReceipt())).not.toThrow()
    expect(() => bindReceiptToInvoice(invoice, { ...demoReceipt(), amountSats: 12 })).toThrow(/amount/)
  })

  it('accepts compressed identity keys only', () => {
    expect(isIdentityKey(PAYEE)).toBe(true)
    expect(isIdentityKey('not-a-key')).toBe(false)
  })
})
