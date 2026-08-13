import type { TicketPayload } from '../../../protocol/ticket'

export interface TicketRecord extends TicketPayload {
  txid: string
  outputIndex: number
  createdAt: Date
}

export interface UTXOReference {
  txid: string
  outputIndex: number
}

export interface TicketQuery {
  outpoint?: string
  serial?: string
  eventId?: string
  limit?: number
  skip?: number
}
