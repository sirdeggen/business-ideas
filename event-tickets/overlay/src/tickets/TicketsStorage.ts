import type { TicketPayload } from '../../../protocol/ticket'
import type { TicketQuery, TicketRecord, UTXOReference } from './types'

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

export class TicketsStorage {
  private readonly records: MongoCollection<TicketRecord>

  constructor(db: { collection: (name: string) => unknown }) {
    this.records = db.collection('EventTicketRecords') as MongoCollection<TicketRecord>
    void this.createIndices()
  }

  private async createIndices(): Promise<void> {
    await this.records.createIndex({ txid: 1, outputIndex: 1 }, { unique: true, name: 'OutpointIndex' })
    await this.records.createIndex({ serial: 1, eventId: 1 }, { name: 'SerialIndex' })
    await this.records.createIndex({ eventId: 1, createdAt: -1 }, { name: 'EventIndex' })
  }

  async storeRecord(txid: string, outputIndex: number, ticket: TicketPayload): Promise<void> {
    await this.records.updateOne(
      { txid, outputIndex },
      {
        $set: {
          txid,
          outputIndex,
          ...ticket,
          createdAt: new Date()
        }
      },
      { upsert: true }
    )
  }

  async deleteRecord(txid: string, outputIndex: number): Promise<void> {
    await this.records.deleteOne({ txid, outputIndex })
  }

  async find(query: TicketQuery): Promise<TicketRecord[]> {
    const limit = Math.min(Math.max(query.limit ?? 50, 0), 200)
    const skip = Math.max(query.skip ?? 0, 0)
    const filter: Record<string, unknown> = {}

    if (query.outpoint) {
      const [txid, outputIndex] = query.outpoint.split('.')
      filter.txid = txid
      filter.outputIndex = Number(outputIndex)
    }
    if (query.serial) filter.serial = query.serial
    if (query.eventId) filter.eventId = query.eventId

    return this.records
      .find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .toArray()
  }

  async findReferences(query: TicketQuery): Promise<UTXOReference[]> {
    const records = await this.find(query)
    return records.map(({ txid, outputIndex }) => ({ txid, outputIndex }))
  }
}
