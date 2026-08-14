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
  joinInvoiceRecords,
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
    createdAt: '2026-08-13T18:00:00.000Z',
    orgName: 'Riverside Community Church',
    billedTo: 'Jordan Lee',
    amountUsd: '50.00'
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

  it('reads invoices that predate the display field', () => {
    const fields = encodeInvoiceFields(demoInvoice()).slice(0, 7)
    expect(parseInvoiceFields(fields)).toEqual({
      ...demoInvoice(),
      orgName: '',
      billedTo: '',
      amountUsd: ''
    })
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

    const payWithChange = classifyInvoiceTransaction(
      [],
      [],
      [{ index: 1, receipt: demoReceipt() }],
      [1500, 1, 88_000]
    )
    expect(payWithChange).toEqual({ action: 'pay', admitOutputIndexes: [1] })

    const voided = classifyInvoiceTransaction(
      [{ index: 0, invoice: demoInvoice() }],
      [],
      [],
      [500]
    )
    expect(voided).toEqual({ action: 'void', admitOutputIndexes: [] })
  })

  it('admits a pay when change sits in front of the billed output', () => {
    const receipt = {
      ...demoReceipt(),
      remittance: { ...demoReceipt().remittance, paymentOutputIndex: 0 }
    }
    const result = classifyInvoiceTransaction(
      [],
      [],
      [{ index: 2, receipt }],
      [88_000, 1500, 1]
    )
    expect(result).toEqual({ action: 'pay', admitOutputIndexes: [2] })
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

describe('client-side invoice + receipt join', () => {
  const createTxid = 'cd'.repeat(32)
  const payTxid = 'ef'.repeat(32)

  it('marks an invoice paid when a matching receipt exists', () => {
    const invoice = demoInvoice()
    const receipt = demoReceipt()
    const [joined] = joinInvoiceRecords(
      [{ invoice, txid: createTxid, outputIndex: 0 }],
      [{ receipt, txid: payTxid, outputIndex: 1, paidAt: '2026-08-14T12:00:00.000Z' }]
    )
    expect(joined.status).toBe('paid')
    expect(joined.invoiceId).toBe(invoice.invoiceId)
    expect(joined.txid).toBe(createTxid)
    expect(joined.paymentTxid).toBe(payTxid)
    expect(joined.receiptTxid).toBe(payTxid)
    expect(joined.receiptOutputIndex).toBe(1)
    expect(joined.payerIdentity).toBe(PAYER)
    expect(joined.paidAt).toBe('2026-08-14T12:00:00.000Z')
    expect(joined.memo).toBe('Choir robes')
    expect(() => assertPayable(joined)).toThrow(/already paid/)
  })

  it('leaves an invoice open when no receipt is indexed', () => {
    const invoice = demoInvoice()
    const [joined] = joinInvoiceRecords(
      [{ invoice, txid: createTxid, outputIndex: 0 }],
      []
    )
    expect(joined.status).toBe('open')
    expect(joined.paymentTxid).toBeUndefined()
    expect(() => assertPayable(joined)).not.toThrow()
  })

  it('still reports paid from a receipt if the create output was not in the page', () => {
    const receipt = demoReceipt()
    const [joined] = joinInvoiceRecords(
      [],
      [{ receipt, txid: payTxid, outputIndex: 1 }]
    )
    expect(joined.status).toBe('paid')
    expect(joined.invoiceId).toBe(receipt.invoiceId)
    expect(joined.paymentTxid).toBe(payTxid)
    expect(joined.txid).toBe(createTxid)
    expect(() => assertPayable(joined)).toThrow(/already paid/)
  })
})
