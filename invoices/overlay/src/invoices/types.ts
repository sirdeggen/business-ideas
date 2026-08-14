import type { InvoicePayload, InvoiceStatus, ReceiptPayload } from '../../../protocol/invoice'

export interface InvoiceRecord extends InvoicePayload {
  txid: string
  outputIndex: number
  status: InvoiceStatus
  indexedAt: Date
  paymentTxid?: string
  paymentOutputIndex?: number
  receiptTxid?: string
  receiptOutputIndex?: number
  payerIdentity?: string
  paidAt?: Date
}

export interface InvoiceQuery {
  outpoint?: string
  invoiceId?: string
  payeeIdentity?: string
  status?: InvoiceStatus
  forPay?: boolean
  limit?: number
  skip?: number
}

export interface PaymentContext {
  invoice: InvoiceRecord
  receipt?: ReceiptPayload
}
