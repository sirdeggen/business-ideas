import type { RecordPayload } from '../../../protocol/record'
import type { RecordDoc, RecordQuery, UTXOReference } from './types'

interface MongoCollection<T> {
  createIndex: (spec: Record<string, unknown>, options?: Record<string, unknown>) => Promise<unknown>
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

export class RecordsStorage {
  private readonly records: MongoCollection<RecordDoc>

  constructor(db: { collection: (name: string) => unknown }) {
    this.records = db.collection('SignedRecordDocs') as MongoCollection<RecordDoc>
    void this.createIndices()
  }

  private async createIndices(): Promise<void> {
    await this.records.createIndex({ txid: 1, outputIndex: 1 }, { unique: true, name: 'OutpointIndex' })
    await this.records.createIndex({ hash: 1 }, { name: 'HashIndex' })
    await this.records.createIndex({ createdAt: -1 }, { name: 'CreatedIndex' })
  }

  async storeRecord(txid: string, outputIndex: number, item: RecordPayload): Promise<void> {
    await this.records.updateOne(
      { txid, outputIndex },
      {
        $set: {
          txid,
          outputIndex,
          ...item,
          createdAt: new Date()
        }
      },
      { upsert: true }
    )
  }

  async deleteRecord(txid: string, outputIndex: number): Promise<void> {
    await this.records.deleteOne({ txid, outputIndex })
  }

  async find(query: RecordQuery): Promise<RecordDoc[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 0), 200)
    const skip = Math.max(query.skip ?? 0, 0)
    const filter: Record<string, unknown> = {}

    if (query.outpoint) {
      const [txid, outputIndex] = query.outpoint.split('.')
      filter.txid = txid
      filter.outputIndex = Number(outputIndex)
    }
    if (query.hash) filter.hash = query.hash

    return this.records
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()
  }

  async findReferences(query: RecordQuery): Promise<UTXOReference[]> {
    const records = await this.find(query)
    return records.map(({ txid, outputIndex }) => ({ txid, outputIndex }))
  }
}
