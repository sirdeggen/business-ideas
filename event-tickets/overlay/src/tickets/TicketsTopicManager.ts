import { AdmittanceInstructions, TopicManager } from '@bsv/overlay'
import { PushDrop, Transaction } from '@bsv/sdk'
import {
  classifyTicketTransaction,
  parseTicketFields,
  type TicketPayload
} from '../../../protocol/ticket'
import docs from './TicketsTopicDocs'

function decodeTicket(lockingScript: Parameters<typeof PushDrop.decode>[0]): TicketPayload | null {
  try {
    const decoded = PushDrop.decode(lockingScript)
    return parseTicketFields(decoded.fields)
  } catch {
    return null
  }
}

export default class TicketsTopicManager implements TopicManager {
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
    const inputTickets: Array<{ index: number, ticket: TicketPayload }> = []
    const outputTickets: Array<{ index: number, ticket: TicketPayload }> = []

    for (const [index, input] of parsedTx.inputs.entries()) {
      if (!previousCoins.includes(index)) continue
      const source = input.sourceTransaction
      if (!source) continue
      const ticket = decodeTicket(source.outputs[input.sourceOutputIndex].lockingScript)
      if (ticket) inputTickets.push({ index, ticket })
    }

    for (const [index, output] of parsedTx.outputs.entries()) {
      const ticket = decodeTicket(output.lockingScript)
      if (ticket) outputTickets.push({ index, ticket })
    }

    const classified = classifyTicketTransaction(inputTickets, outputTickets)
    if (classified.action === 'invalid') {
      return { outputsToAdmit: [], coinsToRetain: [] }
    }

    // Redeem spends a live ticket and admits nothing. The engine still marks
    // the input spent, so later lookups of that outpoint fail.
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
      name: 'Event Tickets Topic Manager',
      shortDescription: 'Admit Demo Night tickets as live UTXOs; reject spent and invalid tickets.',
      version: '0.1.0'
    }
  }
}
