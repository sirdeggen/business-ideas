import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { PushDrop, Transaction } from '@bsv/sdk'
import {
  classifyRecordTransaction,
  parseRecordFields,
  type RecordPayload
} from '../../../protocol/record'
import docs from './RecordsTopicDocs'

function decodeRecord(lockingScript: Parameters<typeof PushDrop.decode>[0]): RecordPayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseRecordFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

export default class RecordsTopicManager implements TopicManager {
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
    _previousCoins: number[]
  ): Promise<AdmittanceInstructions> {
    const parsedTx = Transaction.fromBEEF(beef)
    const outputItems: Array<{ index: number, item: RecordPayload }> = []

    for (const [index, output] of parsedTx.outputs.entries()) {
      const item = decodeRecord(output.lockingScript)
      if (item) outputItems.push({ index, item })
    }

    const classified = classifyRecordTransaction(outputItems)
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
      name: 'Records Topic Manager',
      shortDescription: 'Admit signed field-reading UTXOs; reject junk PushDrop data.',
      version: '0.1.0'
    }
  }
}
