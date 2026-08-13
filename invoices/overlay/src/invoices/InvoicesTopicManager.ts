import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { PushDrop, Transaction } from '@bsv/sdk'
import {
  classifyInvoiceTransaction,
  parseInvoiceFields,
  parseReceiptFields,
  type InvoicePayload,
  type ReceiptPayload
} from '../../../protocol/invoice'
import docs from './InvoicesTopicDocs'

function decodeFields(lockingScript: Parameters<typeof PushDrop.decode>[0]): {
  invoice: InvoicePayload | null
  receipt: ReceiptPayload | null
} {
  try {
    const decoded = PushDrop.decode(lockingScript)
    return {
      invoice: parseInvoiceFields(decoded.fields),
      receipt: parseReceiptFields(decoded.fields)
    }
  } catch {
    return { invoice: null, receipt: null }
  }
}

export default class InvoicesTopicManager implements TopicManager {
  async identifyNeededInputs(
    beef: number[]
  ): Promise<Array<{ txid: string, outputIndex: number }>> {
    const tx = Transaction.fromBEEF(beef)
    if (!Array.isArray(tx.inputs) || tx.inputs.length === 0) {
      return []
    }
    const previousOutpoints: Array<{ txid: string, outputIndex: number }> = []
    for (const input of tx.inputs) {
      if (!input.sourceTransaction && input.sourceTXID) {
        previousOutpoints.push({
          txid: input.sourceTXID,
          outputIndex: input.sourceOutputIndex
        })
      }
    }
    return previousOutpoints
  }

  async identifyAdmissibleOutputs(
    beef: number[],
    previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const parsedTx = Transaction.fromBEEF(beef)
    const inputInvoices: Array<{ index: number, invoice: InvoicePayload }> = []
    const outputInvoices: Array<{ index: number, invoice: InvoicePayload }> = []
    const outputReceipts: Array<{ index: number, receipt: ReceiptPayload }> = []
    const outputSatoshis = parsedTx.outputs.map((output) => Number(output.satoshis ?? 0))

    for (const [index, input] of parsedTx.inputs.entries()) {
      if (!previousCoins.includes(index)) continue
      const source = input.sourceTransaction
      if (!source) continue
      const decoded = decodeFields(source.outputs[input.sourceOutputIndex].lockingScript)
      if (decoded.invoice) inputInvoices.push({ index, invoice: decoded.invoice })
    }

    for (const [index, output] of parsedTx.outputs.entries()) {
      const decoded = decodeFields(output.lockingScript)
      if (decoded.invoice) outputInvoices.push({ index, invoice: decoded.invoice })
      if (decoded.receipt) outputReceipts.push({ index, receipt: decoded.receipt })
    }

    const classified = classifyInvoiceTransaction(
      inputInvoices,
      outputInvoices,
      outputReceipts,
      outputSatoshis
    )
    if (classified.action === 'invalid') {
      return { outputsToAdmit: [], coinsToRetain: [] }
    }

    // Void spends an open invoice and admits nothing. Pay admits the receipt
    // UTXO; lookup then marks the matching open invoice paid (or rejects a
    // second pay for that id).
    return {
      outputsToAdmit: classified.admitOutputIndexes,
      coinsToRetain: []
    }
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
      name: 'Payable Invoices Topic Manager',
      shortDescription: 'Admit open BSV invoice UTXOs and payment receipts; lookup rejects a second pay.',
      version: '0.1.0'
    }
  }
}
