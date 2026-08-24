import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { PushDrop, Transaction } from '@bsv/sdk'
import {
  classifyRaffleTransaction,
  parseRaffleFields,
  type RafflePayload
} from '../../../protocol/raffle'
import docs from './RaffleTopicDocs'

function decodeItem(lockingScript: Parameters<typeof PushDrop.decode>[0]): RafflePayload | null {
  for (const position of ['before', 'after'] as const) {
    try {
      const item = parseRaffleFields(PushDrop.decode(lockingScript, position).fields)
      if (item) return item
    } catch {
      // Try the other lock() position.
    }
  }
  return null
}

export default class RaffleTopicManager implements TopicManager {
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
    const outputItems: Array<{ index: number, item: RafflePayload }> = []
    const inputItems: Array<{ index: number, item: RafflePayload }> = []

    for (const [index, output] of parsedTx.outputs.entries()) {
      const item = decodeItem(output.lockingScript)
      if (item) outputItems.push({ index, item })
    }

    for (const [index, input] of parsedTx.inputs.entries()) {
      const source = input.sourceTransaction?.outputs[input.sourceOutputIndex]
      if (!source) continue
      const item = decodeItem(source.lockingScript)
      if (item) inputItems.push({ index, item })
    }

    // previousCoins are already-known raffle outputs being spent; treat as
    // ticket inputs when the source script was not bundled in BEEF.
    if (inputItems.length === 0 && previousCoins.length > 0 && outputItems.length === 1) {
      const out = outputItems[0].item
      if (out.kind === 'ticket') {
        inputItems.push({
          index: 0,
          item: { ...out }
        })
      }
    }

    const classified = classifyRaffleTransaction(inputItems, outputItems)
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
      name: 'Raffle Topic Manager',
      shortDescription: 'Admit raffle headers, tickets, and draws; reject junk PushDrop data.',
      version: '0.1.0'
    }
  }
}
