import { describe, expect, it } from 'vitest'
import { parseInvoiceLocation } from './route'

const INVOICE_ID = 'ab'.repeat(16)
const CREATE_TX = 'cd'.repeat(32)

describe('invoice shareable route', () => {
  it('reads /i/<invoiceId> without a create txid', () => {
    expect(parseInvoiceLocation(`/business-ideas/invoices/i/${INVOICE_ID}`, '', '')).toEqual({
      invoiceId: INVOICE_ID,
      createTxid: null
    })
  })

  it('reads optional ?tx= for ls_anytx O(1) lookup', () => {
    expect(parseInvoiceLocation(
      `/business-ideas/invoices/i/${INVOICE_ID}`,
      `?tx=${CREATE_TX}`,
      ''
    )).toEqual({
      invoiceId: INVOICE_ID,
      createTxid: CREATE_TX
    })
  })

  it('reads hash #/i/<id>?tx= after the Pages 404 redirect', () => {
    expect(parseInvoiceLocation(
      '/business-ideas/invoices/',
      '',
      `#/i/${INVOICE_ID}?tx=${CREATE_TX}`
    )).toEqual({
      invoiceId: INVOICE_ID,
      createTxid: CREATE_TX
    })
  })
})
