import {
  AdmissionMode,
  LookupFormula,
  LookupQuestion,
  LookupService,
  OutputAdmittedByTopic,
  OutputSpent,
  SpendNotificationMode
} from '@bsv/overlay'
import { PushDrop } from '@bsv/sdk'
import { LOOKUP_SERVICE, TOPIC, parseRecordFields } from '../../../protocol/record'
import docs from './RecordsLookupDocs'
import { RecordsStorage } from './RecordsStorage'
import type { RecordQuery } from './types'

export class RecordsLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor(public storage: RecordsStorage) {}

  async outputAdmittedByTopic(payload: OutputAdmittedByTopic): Promise<void> {
    if (payload.mode !== 'locking-script') return
    const { topic, lockingScript, txid, outputIndex } = payload
    if (topic !== TOPIC) return
    let item = null
    for (const position of ['before', 'after'] as const) {
      try {
        item = parseRecordFields(PushDrop.decode(lockingScript, position).fields)
        if (item) break
      } catch {
        // Try the other lock() position.
      }
    }
    if (!item) return
    await this.storage.storeRecord(txid, outputIndex, item)
  }

  async outputSpent(payload: OutputSpent): Promise<void> {
    if (payload.mode !== 'none') return
    if (payload.topic !== TOPIC) return
    await this.storage.deleteRecord(payload.txid, payload.outputIndex)
  }

  async outputEvicted(txid: string, outputIndex: number): Promise<void> {
    await this.storage.deleteRecord(txid, outputIndex)
  }

  async lookup(question: LookupQuestion): Promise<LookupFormula> {
    if (!question) throw new Error('A valid query must be provided')
    if (question.service !== LOOKUP_SERVICE) throw new Error('Lookup service not supported')
    const query = (question.query ?? {}) as RecordQuery
    const records = await this.storage.find(query)
    return records.map((record) => ({
      txid: record.txid,
      outputIndex: record.outputIndex,
      context: Array.from(new TextEncoder().encode(JSON.stringify({
        magic: record.magic,
        schemaVersion: record.schemaVersion,
        hash: record.hash,
        name: record.name,
        kind: record.kind,
        note: record.note,
        time: record.time,
        lat: record.lat,
        lon: record.lon,
        txid: record.txid,
        outputIndex: record.outputIndex
      })))
    }))
  }

  async getDocumentation(): Promise<string> {
    return docs
  }

  async getMetaData(): Promise<{
    name: string
    shortDescription: string
    version?: string
  }> {
    return {
      name: 'Records Lookup',
      shortDescription: 'Find signed field readings by hash or outpoint.',
      version: '0.1.0'
    }
  }
}

export default (db: { collection: (name: string) => unknown }): RecordsLookupService =>
  new RecordsLookupService(new RecordsStorage(db))
