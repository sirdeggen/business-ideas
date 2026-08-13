import { DuplicateInvoiceError } from './duplicate'
import type { ReceivablePayload } from '../../../protocol/receivable'
import type { ReceivableQuery, ReceivableRecord } from './types'

interface MongoCollection<T> {
  createIndex: (spec: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
  findOne: (filter: object) => Promise<T | null>
  updateOne: (filter: object, update: object, options?: object) => Promise<unknown>
  deleteOne: (filter: object) => Promise<unknown>
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

export class ReceivablesStorage {
  private readonly records: MongoCollection<ReceivableRecord>

  constructor(db: { collection: (name: string) => unknown }) {
    this.records = db.collection('ReceivableRecords') as MongoCollection<ReceivableRecord>
    void this.createIndices()
  }

  private async createIndices(): Promise<void> {
    await this.records.createIndex({ txid: 1, outputIndex: 1 }, { unique: true, name: 'OutpointIndex' })
    await this.records.createIndex({ invoiceId: 1 }, { unique: true, name: 'InvoiceIdIndex' })
    await this.records.createIndex({ status: 1, createdAt: -1 }, { name: 'StatusIndex' })
    await this.records.createIndex({ creditor: 1, status: 1 }, { name: 'CreditorIndex' })
    await this.records.createIndex({ debtor: 1, status: 1 }, { name: 'DebtorIndex' })
  }

  async storeRecord(txid: string, outputIndex: number, item: ReceivablePayload): Promise<void> {
    const existing = await this.records.findOne({ invoiceId: item.invoiceId })
    if (existing && (existing.txid !== txid || existing.outputIndex !== outputIndex)) {
      // A second register of a live (or paid) invoice id is rejected.
      // A later UTXO for the same id is allowed only as a status spend.
      if (existing.status === 'paid' || item.status === 'open') {
        throw new DuplicateInvoiceError(item.invoiceId)
      }
    }
    const now = new Date()
    await this.records.updateOne(
      { invoiceId: item.invoiceId },
      {
        $set: {
          txid,
          outputIndex,
          ...item,
          updatedAt: now
        },
        $setOnInsert: { createdAt: now }
      },
      { upsert: true }
    )
  }

  async deleteRecord(txid: string, outputIndex: number): Promise<void> {
    const existing = await this.records.findOne({ txid, outputIndex })
    if (existing?.status === 'paid') return
    await this.records.deleteOne({ txid, outputIndex })
  }

  async findByInvoiceId(invoiceId: string): Promise<ReceivableRecord | null> {
    return this.records.findOne({ invoiceId })
  }

  async recordAdvanceIntent(invoiceId: string, advanceBps: number): Promise<ReceivableRecord> {
    const existing = await this.findByInvoiceId(invoiceId)
    if (!existing) throw new Error(`No receivable ${invoiceId}`)
    if (existing.status !== 'approved') {
      throw new Error('Advance-intent is only recorded against approved unpaid invoices')
    }
    await this.records.updateOne(
      { invoiceId },
      { $set: { advanceBps, updatedAt: new Date() } }
    )
    const updated = await this.findByInvoiceId(invoiceId)
    if (!updated) throw new Error(`No receivable ${invoiceId}`)
    return updated
  }

  async find(query: ReceivableQuery): Promise<ReceivableRecord[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 0), 200)
    const skip = Math.max(query.skip ?? 0, 0)
    const filter: Record<string, unknown> = {}

    if (query.outpoint) {
      const [txid, outputIndex] = query.outpoint.split('.')
      filter.txid = txid
      filter.outputIndex = Number(outputIndex)
    }
    if (query.invoiceId) filter.invoiceId = query.invoiceId
    if (query.creditor) filter.creditor = query.creditor
    if (query.debtor) filter.debtor = query.debtor
    if (query.approvedUnpaid) {
      filter.status = 'approved'
    } else if (query.status === 'unpaid') {
      filter.status = { $in: ['open', 'approved'] }
    } else if (query.status) {
      filter.status = query.status
    }

    return this.records
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()
  }
}
