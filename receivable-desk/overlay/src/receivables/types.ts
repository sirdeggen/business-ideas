import type { ReceivablePayload } from '../../../protocol/receivable'

export interface ReceivableRecord extends ReceivablePayload {
  txid: string
  outputIndex: number
  createdAt: Date
  updatedAt: Date
}

export interface UTXOReference {
  txid: string
  outputIndex: number
}

export interface ReceivableQuery {
  outpoint?: string
  invoiceId?: string
  creditor?: string
  debtor?: string
  status?: ReceivablePayload['status'] | 'unpaid'
  approvedUnpaid?: boolean
  limit?: number
  skip?: number
}
