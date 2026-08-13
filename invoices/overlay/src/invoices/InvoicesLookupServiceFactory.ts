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
import {
  LOOKUP_SERVICE,
  TOPIC,
  assertPayable,
  parseInvoiceFields,
  parseReceiptFields
} from '../../../protocol/invoice'
import docs from './InvoicesLookupDocs'
import { InvoicesStorage } from './InvoicesStorage'
import type { InvoiceQuery, InvoiceRecord } from './types'

function recordContext(record: InvoiceRecord): number[] {
  return Array.from(new TextEncoder().encode(JSON.stringify({
    txid: record.txid,
    outputIndex: record.outputIndex,
    invoiceId: record.invoiceId,
    payeeIdentity: record.payeeIdentity,
    amountSats: record.amountSats,
    memo: record.memo,
    dueDate: record.dueDate,
    createdAt: record.createdAt,
    status: record.status,
    paymentTxid: record.paymentTxid,
    paymentOutputIndex: record.paymentOutputIndex,
    receiptTxid: record.receiptTxid,
    receiptOutputIndex: record.receiptOutputIndex,
    payerIdentity: record.payerIdentity,
    paidAt: record.paidAt
  })))
}

export class InvoicesLookupService implements LookupService {
  readonly admissionMode: AdmissionMode = 'locking-script'
  readonly spendNotificationMode: SpendNotificationMode = 'none'

  constructor(public storage: InvoicesStorage) {}

  async outputAdmittedByTopic(payload: OutputAdmittedByTopic): Promise<void> {
    if (payload.mode !== 'locking-script') return
    const { topic, lockingScript, txid, outputIndex } = payload
    if (topic !== TOPIC) return
    const decoded = PushDrop.decode(lockingScript)
    const invoice = parseInvoiceFields(decoded.fields)
    if (invoice) {
      await this.storage.storeOpen(txid, outputIndex, invoice)
      return
    }
    const receipt = parseReceiptFields(decoded.fields)
    if (receipt) {
      await this.storage.markPaid(txid, outputIndex, receipt)
    }
  }

  async outputSpent(payload: OutputSpent): Promise<void> {
    if (payload.mode !== 'none') return
    if (payload.topic !== TOPIC) return
    await this.storage.markVoided(payload.txid, payload.outputIndex)
  }

  async outputEvicted(txid: string, outputIndex: number): Promise<void> {
    await this.storage.markVoided(txid, outputIndex)
  }

  async lookup(question: LookupQuestion): Promise<LookupFormula> {
    if (!question) throw new Error('A valid query must be provided')
    if (question.service !== LOOKUP_SERVICE) throw new Error('Lookup service not supported')
    const query = (question.query ?? {}) as InvoiceQuery
    if (query.forPay && !query.invoiceId) {
      throw new Error('forPay requires invoiceId')
    }
    const records = await this.storage.find(query)
    if (query.forPay) {
      assertPayable(records[0] ?? null)
    }
    return records.map((record) => ({
      txid: record.txid,
      outputIndex: record.outputIndex,
      context: recordContext(record)
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
      name: 'Payable Invoices Lookup',
      shortDescription: 'Find open and paid BSV invoices; reject a second pay.',
      version: '0.1.0'
    }
  }
}

export default (db: { collection: (name: string) => unknown }): InvoicesLookupService =>
  new InvoicesLookupService(new InvoicesStorage(db))
