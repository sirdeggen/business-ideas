import type { RafflePayload } from '../../../protocol/raffle'

export type RaffleDoc = RafflePayload & {
  txid: string
  outputIndex: number
  createdAt: Date
}

export interface UTXOReference {
  txid: string
  outputIndex: number
}

export interface RaffleQuery {
  outpoint?: string
  raffleId?: string
  limit?: number
  skip?: number
}
