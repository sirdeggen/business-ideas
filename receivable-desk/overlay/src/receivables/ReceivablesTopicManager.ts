import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { PushDrop, Transaction } from '@bsv/sdk'
import {
  classifyReceivableTransaction,
  parseReceivableFields,
  type ReceivablePayload
} from '../../../protocol/receivable'
import docs from './ReceivablesTopicDocs'

function decodeReceivable(lockingScript: Parameters<typeof PushDrop.decode>[0]): ReceivablePayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseReceivableFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

export default class ReceivablesTopicManager implements TopicManager {
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
    const inputItems: Array<{ index: number, item: ReceivablePayload }> = []
    const outputItems: Array<{ index: number, item: ReceivablePayload }> = []

    for (const [index, input] of parsedTx.inputs.entries()) {
      if (!previousCoins.includes(index)) continue
      const source = input.sourceTransaction
      if (!source) continue
      const item = decodeReceivable(source.outputs[input.sourceOutputIndex].lockingScript)
      if (item) inputItems.push({ index, item })
    }

    for (const [index, output] of parsedTx.outputs.entries()) {
      const item = decodeReceivable(output.lockingScript)
      if (item) outputItems.push({ index, item })
    }

    const outputSatoshis = parsedTx.outputs.map((output) => Number(output.satoshis ?? 0))
    const classified = classifyReceivableTransaction(inputItems, outputItems, outputSatoshis)
    if (classified.action === 'invalid') {
      return { outputsToAdmit: [], coinsToRetain: [] }
    }

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
      name: 'Receivables Topic Manager',
      shortDescription: 'Admit invoice registry UTXOs; settle requires a same-tx BRC-29 payment of the billed sats.',
      version: '0.1.0'
    }
  }
}
