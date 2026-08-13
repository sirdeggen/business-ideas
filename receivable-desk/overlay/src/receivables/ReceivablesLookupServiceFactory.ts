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
import { LOOKUP_SERVICE, TOPIC, parseReceivableFields } from '../../../protocol/receivable'
import { DuplicateInvoiceError } from './duplicate'
import docs from './ReceivablesLookupDocs'
import { ReceivablesStorage } from './ReceivablesStorage'
import type { ReceivableQuery } from './types'

export class ReceivablesLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor(public storage: ReceivablesStorage) {}

  async outputAdmittedByTopic(payload: OutputAdmittedByTopic): Promise<void> {
    if (payload.mode !== 'locking-script') return
    const { topic, lockingScript, txid, outputIndex } = payload
    if (topic !== TOPIC) return
    const decoded = PushDrop.decode(lockingScript)
    const item = parseReceivableFields(decoded.fields)
    if (!item) return
    try {
      await this.storage.storeRecord(txid, outputIndex, item)
    } catch (error) {
      if (error instanceof DuplicateInvoiceError) return
      throw error
    }
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
    const query = (question.query ?? {}) as ReceivableQuery
    const records = await this.storage.find(query)
    return records.map((record) => ({
      txid: record.txid,
      outputIndex: record.outputIndex,
      context: Array.from(new TextEncoder().encode(JSON.stringify({
        txid: record.txid,
        outputIndex: record.outputIndex,
        invoiceId: record.invoiceId,
        creditor: record.creditor,
        debtor: record.debtor,
        amountSats: record.amountSats,
        dueDate: record.dueDate,
        status: record.status,
        memo: record.memo,
        advanceBps: record.advanceBps
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
      name: 'Receivables Lookup',
      shortDescription: 'Find invoice registry UTXOs by status, creditor, debtor, or invoice id.',
      version: '0.1.0'
    }
  }
}

let latestStorage: ReceivablesStorage | null = null

export function getReceivablesStorage(): ReceivablesStorage {
  if (!latestStorage) throw new Error('overlay storage not ready')
  return latestStorage
}

export default (db: { collection: (name: string) => unknown }): ReceivablesLookupService => {
  latestStorage = new ReceivablesStorage(db)
  return new ReceivablesLookupService(latestStorage)
}
