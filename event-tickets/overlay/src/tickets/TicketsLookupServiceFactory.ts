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
import { LOOKUP_SERVICE, TOPIC, parseTicketFields } from '../../../protocol/ticket'
import docs from './TicketsLookupDocs'
import { TicketsStorage } from './TicketsStorage'
import type { TicketQuery } from './types'

export class TicketsLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor(public storage: TicketsStorage) {}

  async outputAdmittedByTopic(payload: OutputAdmittedByTopic): Promise<void> {
    if (payload.mode !== 'locking-script') return
    const { topic, lockingScript, txid, outputIndex } = payload
    if (topic !== TOPIC) return
    const decoded = PushDrop.decode(lockingScript)
    const ticket = parseTicketFields(decoded.fields)
    if (!ticket) return
    await this.storage.storeRecord(txid, outputIndex, ticket)
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
    const query = (question.query ?? {}) as TicketQuery
    const records = await this.storage.find(query)
    return records.map((record) => ({
      txid: record.txid,
      outputIndex: record.outputIndex,
      context: Array.from(new TextEncoder().encode(JSON.stringify({
        txid: record.txid,
        outputIndex: record.outputIndex,
        eventId: record.eventId,
        serial: record.serial,
        kind: record.kind,
        name: record.name,
        venue: record.venue,
        startsAt: record.startsAt
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
      name: 'Event Tickets Lookup',
      shortDescription: 'Find live Demo Night ticket UTXOs; spent tickets are gone.',
      version: '0.1.0'
    }
  }
}

export default (db: { collection: (name: string) => unknown }): TicketsLookupService =>
  new TicketsLookupService(new TicketsStorage(db))
