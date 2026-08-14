import {
  assertPayable,
  bindReceiptToInvoice,
  type InvoicePayload,
  type ReceiptPayload
} from '../../../protocol/invoice'
import type { InvoiceQuery, InvoiceRecord } from './types'

interface MongoCollection<T> {
  createIndex: (spec: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  updateOne: (filter: object, update: object, options?: object) => Promise<{ matchedCount?: number, modifiedCount?: number }>
  findOne: (filter: object) => Promise<T | null>
  find: (filter: object) => {
    sort: (spec: object) => {
      skip: (n: number) => {
        limit: (n: number) => {
          toArray: () => Promise<T[]>
        }
      }
    }
  }
}

export class InvoicesStorage {
  private readonly records: MongoCollection<InvoiceRecord>

  constructor(db: { collection: (name: string) => unknown }) {
    this.records = db.collection('PayableInvoiceRecords') as MongoCollection<InvoiceRecord>
    void this.createIndices()
  }

  private async createIndices(): Promise<void> {
    await this.records.createIndex({ txid: 1, outputIndex: 1 }, { unique: true, name: 'OutpointIndex' })
    await this.records.createIndex({ invoiceId: 1 }, { unique: true, name: 'InvoiceIdIndex' })
    await this.records.createIndex({ status: 1, indexedAt: -1 }, { name: 'StatusIndex' })
    await this.records.createIndex({ payeeIdentity: 1, indexedAt: -1 }, { name: 'PayeeIndex' })
  }

  async storeOpen(txid: string, outputIndex: number, invoice: InvoicePayload): Promise<void> {
    await this.records.updateOne(
      { invoiceId: invoice.invoiceId },
      {
        $setOnInsert: {
          txid,
          outputIndex,
          ...invoice,
          status: 'open',
          indexedAt: new Date()
        }
      },
      { upsert: true }
    )
  }

  async markPaid(
    receiptTxid: string,
    receiptOutputIndex: number,
    receipt: ReceiptPayload
  ): Promise<InvoiceRecord> {
    const existing = await this.records.findOne({ invoiceId: receipt.invoiceId })
    assertPayable(existing)
    if (!existing) throw new Error('Unknown invoice')
    bindReceiptToInvoice(existing, receipt)
    if (receipt.invoiceOutpoint !== `${existing.txid}.${existing.outputIndex}`) {
      throw new Error('Receipt does not spend/reference the open invoice outpoint')
    }

    const result = await this.records.updateOne(
      { invoiceId: receipt.invoiceId, status: 'open' },
      {
        $set: {
          status: 'paid',
          paymentTxid: receiptTxid,
          paymentOutputIndex: receipt.remittance.paymentOutputIndex,
          receiptTxid,
          receiptOutputIndex,
          payerIdentity: receipt.payerIdentity,
          paidAt: new Date()
        }
      }
    )
    if (!result.matchedCount) {
      throw new Error('Invoice already paid')
    }

    const paid = await this.records.findOne({ invoiceId: receipt.invoiceId })
    if (!paid) throw new Error('Invoice disappeared after pay')
    return paid
  }

  async markVoided(txid: string, outputIndex: number): Promise<void> {
    await this.records.updateOne(
      { txid, outputIndex, status: 'open' },
      { $set: { status: 'voided' } }
    )
  }

  async find(query: InvoiceQuery): Promise<InvoiceRecord[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 0), 200)
    const skip = Math.max(query.skip ?? 0, 0)
    const filter: Record<string, unknown> = {}

    if (query.outpoint) {
      const [txid, outputIndex] = query.outpoint.split('.')
      filter.txid = txid
      filter.outputIndex = Number(outputIndex)
    }
    if (query.invoiceId) filter.invoiceId = query.invoiceId
    if (query.payeeIdentity) filter.payeeIdentity = query.payeeIdentity
    if (query.status) filter.status = query.status

    return this.records
      .find(filter)
      .sort({ indexedAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()
  }
}
